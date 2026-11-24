import type {
  CheckboxWithDetailsFormComponentDefinitionFrame,
  FormConfigFrame,
} from '@researchdatabox/sails-ng-common';

const formats: CheckboxWithDetailsFormComponentDefinitionFrame = {
  name: 'digitalFormatEstimates',
  component: {
    class: 'CheckboxWithDetailsComponent',
    config: {
      vocabRef: 'checkbox-details-formats',
      detailFields: [
        {
          name: 'volume',
          component: { class: 'SimpleInputComponent', config: { type: 'text', placeholder: 'e.g. 3 TB' } },
          model: { class: 'SimpleInputModel', config: { defaultValue: '10 GB', validators: [{ class: 'required' }] } },
          layout: {
            class: 'DefaultLayout',
            config: { label: 'Estimated volume', helpText: 'Include a unit or approximate file count.' },
          },
        },
      ],
      detailFieldsByValue: {
        'legacy-media': [
          {
            name: 'privateReference',
            component: { class: 'SimpleInputComponent', config: { visible: false } },
          },
        ],
        other: [
          {
            name: 'description',
            component: { class: 'TextAreaComponent', config: { rows: 2 } },
            model: { class: 'TextAreaModel', config: { defaultValue: 'Custom exports', validators: [{ class: 'required' }] } },
            layout: { class: 'DefaultLayout', config: { label: 'Describe the format' } },
          },
        ],
      },
    },
  },
  model: { class: 'CheckboxWithDetailsModel', config: { validators: [{ class: 'required' }] } },
  layout: { class: 'DefaultLayout', config: { label: 'Digital formats and estimated volume' } },
};

const config: FormConfigFrame = {
  name: 'checkbox-details-1.0',
  type: 'checkbox-details-demo',
  domElementType: 'form',
  editCssClasses: 'redbox-form form',
  enabledValidationGroups: ['none'],
  validationGroups: {
    draft: { description: 'Check basic draft information', initialMembership: 'none' },
  },
  validationOperations: {
    draft: { enabledValidationGroups: ['draft'] },
    activate: { enabledValidationGroups: ['all'], allowedTargetSteps: ['active'] },
  },
  componentDefinitions: [
    {
      name: 'sections',
      component: {
        class: 'TabComponent',
        config: {
          tabs: [
            {
              name: 'project',
              layout: { class: 'TabContentLayout', config: { buttonLabel: 'Project' } },
              component: {
                class: 'TabContentComponent',
                config: {
                  componentDefinitions: [
                    {
                      name: 'title',
                      component: { class: 'SimpleInputComponent' },
                      model: { class: 'SimpleInputModel', config: { validators: [
                        { class: 'required', groups: { include: ['draft'] } },
                      ] } },
                      layout: { class: 'DefaultLayout', config: { label: 'Project title' } },
                    },
                  ],
                },
              },
            },
            {
              name: 'formats',
              layout: { class: 'TabContentLayout', config: { buttonLabel: 'Formats' } },
              component: { class: 'TabContentComponent', config: { componentDefinitions: [formats] } },
            },
          ],
        },
      },
      layout: { class: 'TabLayout' },
    },
    { name: 'summary', component: { class: 'ValidationSummaryComponent' } },
    { name: 'saveStatus', component: { class: 'SaveStatusComponent' } },
    {
      name: 'saveDraft',
      component: {
        class: 'SaveButtonComponent',
        config: {
          label: 'Save draft',
          operation: 'draft',
          enabledValidationGroups: ['draft'],
        },
      },
    },
    {
      name: 'activate',
      component: {
        class: 'SaveButtonComponent',
        config: {
          label: 'Activate',
          operation: 'activate',
          targetStep: 'active',
          enabledValidationGroups: ['all'],
          disableWhenInvalid: false,
        },
      },
    },
  ],
};

export default config;
