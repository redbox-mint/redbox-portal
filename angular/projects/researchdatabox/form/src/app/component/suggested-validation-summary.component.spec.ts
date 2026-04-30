import { TestBed } from '@angular/core/testing';
import { FormConfigFrame, TabFieldComponentConfigFrame } from '@researchdatabox/sails-ng-common';
import { FormService } from '../form.service';
import { createFormAndWaitForReady, createTestbedModule } from '../helpers.spec';
import { SimpleInputComponent } from './simple-input.component';
import { SaveButtonComponent } from './save-button.component';
import { SuggestedValidationSummaryFieldComponent } from './suggested-validation-summary.component';
import { GroupFieldComponent } from './group.component';
import { TabComponent, TabComponentLayout, TabContentComponent } from './tab.component';
import { ValidationSummaryFieldComponent } from './validation-summary.component';

describe('SuggestedValidationSummaryFieldComponent', () => {
  beforeEach(async () => {
    await createTestbedModule({
      declarations: {
        "SimpleInputComponent": SimpleInputComponent,
        "SaveButtonComponent": SaveButtonComponent,
        "ValidationSummaryFieldComponent": ValidationSummaryFieldComponent,
        "SuggestedValidationSummaryFieldComponent": SuggestedValidationSummaryFieldComponent,
        "GroupFieldComponent": GroupFieldComponent,
        "TabComponent": TabComponent,
        "TabComponentLayout": TabComponentLayout,
        "TabContentComponent": TabContentComponent,
      }
    });
  });

  it('should create component', () => {
    const fixture = TestBed.createComponent(SuggestedValidationSummaryFieldComponent);
    expect(fixture.componentInstance).toBeDefined();
  });

  it('should render no panel when no suggestion failures exist and showWhenValid is false', async () => {
    const { fixture } = await createFormAndWaitForReady(baseSuggestedFormConfig({
      suggestedValue: 'complete',
      suggestedGroups: { include: ['recommended'], exclude: ['all'] },
    }));

    const nativeEl: HTMLElement = fixture.nativeElement;
    expect(nativeEl.querySelector('div.alert-warning')).toBeNull();
    expect(nativeEl.querySelector('div.alert-info')).toBeNull();
  });

  it('should render the localized completion message when no suggestion failures exist and showWhenValid is true', async () => {
    const { fixture } = await createFormAndWaitForReady(baseSuggestedFormConfig({
      suggestedValue: 'complete',
      suggestedGroups: { include: ['recommended'], exclude: ['all'] },
      suggestedSummaryConfig: { showWhenValid: true },
    }));

    const panel = fixture.nativeElement.querySelector('div.alert-info');

    expect(panel).toBeTruthy();
    expect(panel?.textContent).toContain('@dmpt-form-suggested-validation-summary-complete');
  });

  it('should render a warning panel for failing validators in the configured suggested group', async () => {
    const { fixture } = await createFormAndWaitForReady(baseSuggestedFormConfig({
      suggestedValue: '',
      suggestedGroups: { include: ['recommended'], exclude: ['all'] },
    }));

    const nativeEl: HTMLElement = fixture.nativeElement;
    const panel = nativeEl.querySelector('div.alert-warning');
    const link = panel?.querySelector('a[data-suggested-validation-summary-id="form-item-id-recommended-field"]');
    const errorItem = panel?.querySelector('li[data-suggested-validation-error-class="required"][data-suggested-validation-error-message="@validator-error-required"]');

    expect(panel).toBeTruthy();
    expect(link).toBeTruthy();
    expect(errorItem).toBeTruthy();
    expect(panel?.textContent).toContain('@dmpt-form-suggested-validation-summary-header');
    expect(panel?.querySelector('.suggested-validation-summary__footer')).toBeNull();
  });

  it('should not make the form invalid or mutate control errors when only suggested validators fail', async () => {
    const { fixture, formComponent } = await createFormAndWaitForReady(baseSuggestedFormConfig({
      suggestedValue: '',
      suggestedGroups: { include: ['recommended'], exclude: ['all'] },
    }));

    const recommendedEntry = fixture.componentInstance.componentDefArr[0];
    const control = recommendedEntry.model?.formControl;

    expect(formComponent.form!.valid).toBeTrue();
    expect(control?.errors).toBeNull();
  });

  it('should not disable save when only suggested validators fail and the form is dirty', async () => {
    const { fixture, formComponent } = await createFormAndWaitForReady(baseSuggestedFormConfig({
      suggestedValue: '',
      suggestedGroups: { include: ['recommended'], exclude: ['all'] },
      includeSaveButton: true,
    }));

    const control = fixture.componentInstance.componentDefArr[0].model?.formControl;
    control?.setValue('still valid for hard validators');
    control?.setValue('');
    formComponent.form!.markAsDirty();
    fixture.detectChanges();
    await fixture.whenStable();

    const saveButton = fixture.nativeElement.querySelector('redbox-form-save-button button') as HTMLButtonElement | null;
    expect(formComponent.form!.valid).toBeTrue();
    expect(saveButton?.disabled).toBeFalse();
  });

  it('should support includeTabLabel through inherited label rendering', async () => {
    const { fixture } = await createFormAndWaitForReady({
      ...baseSuggestedFormConfig({
        suggestedValue: '',
        suggestedGroups: { include: ['recommended'], exclude: ['all'] },
      }),
      componentDefinitions: [
        {
          name: 'main_tab',
          layout: {
            class: 'TabLayout',
            config: {
              buttonSectionCssClass: 'nav',
              tabPaneCssClass: 'tab-pane',
              tabPaneActiveCssClass: 'active',
            }
          },
          component: {
            class: 'TabComponent',
            config: {
              tabs: [
                {
                  name: 'details_tab',
                  layout: { class: 'TabContentLayout', config: { label: '@details-tab-label' } },
                  component: {
                    class: 'TabContentComponent',
                    config: {
                      componentDefinitions: [
                        recommendedFieldDefinition('', { include: ['recommended'], exclude: ['all'] }),
                      ],
                    },
                  },
                },
              ],
            } as TabFieldComponentConfigFrame,
          },
        },
        suggestedSummaryDefinition({ includeTabLabel: true }),
      ],
    });

    const link = fixture.nativeElement.querySelector('a[data-suggested-validation-summary-id="form-item-id-recommended-field"]');
    expect(link?.textContent).toContain('@details-tab-label');
  });

  it('should ignore validators from groups not listed in component config', async () => {
    const { fixture } = await createFormAndWaitForReady(baseSuggestedFormConfig({
      suggestedValue: '',
      suggestedGroups: { include: ['otherRecommendation'], exclude: ['all'] },
    }));

    expect(fixture.nativeElement.querySelector('div.alert-warning')).toBeNull();
    const summaryComponent = fixture.componentInstance.componentDefArr[1].component as SuggestedValidationSummaryFieldComponent;
    expect(summaryComponent.allValidationErrorsDisplay).toEqual([]);
  });

  it('should ignore disabled controls when suggested validators fail', async () => {
    const config = baseSuggestedFormConfig({
      suggestedValue: '',
      suggestedGroups: { include: ['recommended'], exclude: ['all'] },
    });
    config.componentDefinitions[0].model!.config!.disabled = true;

    const { fixture } = await createFormAndWaitForReady(config);

    const control = fixture.componentInstance.componentDefArr[0].model?.formControl;
    const summaryComponent = fixture.componentInstance.componentDefArr[1].component as SuggestedValidationSummaryFieldComponent;

    expect(control?.disabled).toBeTrue();
    expect(summaryComponent.allValidationErrorsDisplay).toEqual([]);
    expect(fixture.nativeElement.querySelector('div.alert-warning')).toBeNull();
  });

  it('should reuse cached suggested validator instances and errors between unchanged reads', async () => {
    const { fixture } = await createFormAndWaitForReady(baseSuggestedFormConfig({
      suggestedValue: '',
      suggestedGroups: { include: ['recommended'], exclude: ['all'] },
    }));
    const formService = TestBed.inject(FormService);
    const validatorsSupport = (formService as unknown as {
      validatorsSupport: { createFormValidatorInstancesFromMapping: (...args: unknown[]) => unknown };
    }).validatorsSupport;
    const createValidatorsSpy = spyOn(validatorsSupport, 'createFormValidatorInstancesFromMapping').and.callThrough();
    const summaryComponent = fixture.componentInstance.componentDefArr[1].component as SuggestedValidationSummaryFieldComponent;
    const callsBeforeReads = createValidatorsSpy.calls.count();

    expect(summaryComponent.allValidationErrorsDisplay.length).toBe(1);
    expect(summaryComponent.allValidationErrorsDisplay.length).toBe(1);
    expect(createValidatorsSpy.calls.count()).toBe(callsBeforeReads);
  });
});

function baseSuggestedFormConfig(options: {
  suggestedValue: string;
  suggestedGroups: { include?: string[]; exclude?: string[] };
  includeSaveButton?: boolean;
  suggestedSummaryConfig?: Record<string, unknown>;
}): FormConfigFrame {
  const componentDefinitions: FormConfigFrame['componentDefinitions'] = [
    recommendedFieldDefinition(options.suggestedValue, options.suggestedGroups),
    suggestedSummaryDefinition(options.suggestedSummaryConfig),
  ];

  if (options.includeSaveButton) {
    componentDefinitions.push({
      name: 'save_button',
      component: {
        class: 'SaveButtonComponent',
        config: {
          label: 'Save',
        },
      },
    });
  }

  return {
    name: 'testing',
    debugValue: true,
    domElementType: 'form',
    defaultComponentConfig: {
      defaultComponentCssClasses: 'row',
    },
    editCssClasses: 'redbox-form form',
    enabledValidationGroups: ['all'],
    validationGroups: {
      all: { description: 'All hard validations', initialMembership: 'all' },
      recommended: { description: 'Recommended fields', initialMembership: 'none' },
      otherRecommendation: { description: 'Other recommended fields', initialMembership: 'none' },
    },
    componentDefinitions,
  };
}

function recommendedFieldDefinition(value: string, groups: { include?: string[]; exclude?: string[] }): FormConfigFrame['componentDefinitions'][number] {
  return {
    name: 'recommended_field',
    layout: {
      class: 'DefaultLayout',
      config: {
        label: '@recommended-field-label',
      },
    },
    model: {
      class: 'SimpleInputModel',
      config: {
        value,
        validators: [
          {
            class: 'required',
            groups,
          },
        ],
      },
    },
    component: {
      class: 'SimpleInputComponent',
    },
  };
}

function suggestedSummaryDefinition(config?: Record<string, unknown>): FormConfigFrame['componentDefinitions'][number] {
  return {
    name: 'suggested_validation_summary_1',
    component: {
      class: 'SuggestedValidationSummaryComponent',
      config: {
        enabledValidationGroups: ['recommended'],
        ...config,
      },
    },
  };
}
