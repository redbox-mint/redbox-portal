import type {
  AccordionFormComponentDefinitionFrame,
  FormConfigFrame,
  SimpleInputFormComponentDefinitionFrame,
  TabFormComponentDefinitionFrame,
} from '@researchdatabox/sails-ng-common';

function textField(name: string, label: string, defaultValue = 'Valid'): SimpleInputFormComponentDefinitionFrame {
  return {
    name,
    layout: { class: 'DefaultLayout', config: { label } },
    component: { class: 'SimpleInputComponent' },
    model: { class: 'SimpleInputModel', config: { defaultValue } },
  };
}

function required(name: string, label: string, message: string, group = 'ordinary') {
  const field = textField(name, label, group === 'recommended' ? '' : 'Valid');
  return {
    ...field,
    model: {
      class: 'SimpleInputModel',
      config: {
        ...field.model?.config,
        validators: [{ class: 'required', message, groups: { include: [group] } }],
      },
    },
  } satisfies SimpleInputFormComponentDefinitionFrame;
}

function tabs(details: FormConfigFrame['componentDefinitions']): TabFormComponentDefinitionFrame {
  return {
    name: 'tabs',
    layout: { class: 'TabLayout' },
    component: {
      class: 'TabComponent',
      config: {
        tabs: [
          {
            name: 'overview',
            layout: { class: 'TabContentLayout', config: { buttonLabel: 'Overview' } },
            component: {
              class: 'TabContentComponent',
              config: { selected: true, componentDefinitions: [textField('overview', 'Overview note', 'Overview')] },
            },
          },
          {
            name: 'details',
            layout: { class: 'TabContentLayout', config: { buttonLabel: 'Details' } },
            component: { class: 'TabContentComponent', config: { componentDefinitions: details } },
          },
        ],
      },
    },
  };
}

function panels(field: SimpleInputFormComponentDefinitionFrame): AccordionFormComponentDefinitionFrame {
  return {
    name: 'panels',
    layout: { class: 'AccordionLayout' },
    component: {
      class: 'AccordionComponent',
      config: {
        startingOpenMode: 'first-open',
        panels: [
          {
            name: 'intro',
            layout: { class: 'AccordionPanelLayout', config: { buttonLabel: 'Introduction' } },
            component: {
              class: 'AccordionPanelComponent',
              config: { componentDefinitions: [textField('intro', 'Introduction note', 'Introduction')] },
            },
          },
          {
            name: 'closed',
            layout: { class: 'AccordionPanelLayout', config: { buttonLabel: 'More details' } },
            component: { class: 'AccordionPanelComponent', config: { componentDefinitions: [field] } },
          },
        ],
      },
    },
  };
}

function form(type: string, fields: FormConfigFrame['componentDefinitions']): FormConfigFrame {
  return {
    name: `${type}-1.0-draft`,
    type,
    domElementType: 'form',
    validationGroups: {
      ordinary: { description: 'Ordinary validation', initialMembership: 'none' },
      recommended: { description: 'Recommendations', initialMembership: 'none' },
    },
    enabledValidationGroups: ['ordinary'],
    validationOperations: { ordinary: { enabledValidationGroups: ['ordinary'] } },
    componentDefinitions: [
      { name: 'errors', component: { class: 'ValidationSummaryComponent', config: { includeTabLabel: true } } },
      ...fields,
      textField('title', 'Title', type),
      {
        name: 'save',
        constraints: { allowModes: ['edit'] },
        component: {
          class: 'SaveButtonComponent',
          config: { label: 'Save', labelSaving: 'Saving…', operation: 'ordinary' },
        },
      },
      { name: 'saveStatus', component: { class: 'SaveStatusComponent' } },
    ],
  };
}

// F13's separate tab/panel recipe; valid defaults match the test's saved starting record.
export const pw05Summaries = form('pw-05-validation-focus', [
  required('requiredValue', 'Required value', 'Complete the ordinary field'),
  tabs([required('tabValue', 'Hidden tab value', 'Complete the hidden tab')]),
  panels(required('panelValue', 'Closed panel value', 'Complete the closed panel')),
  required('advisoryValue', 'Recommended value', 'A recommendation remains', 'recommended'),
  {
    name: 'suggestions',
    component: {
      class: 'SuggestedValidationSummaryComponent',
      config: { enabledValidationGroups: ['recommended'], header: 'Recommendations' },
    },
  },
]);

// Additional PW-05 case: the target has both a tab and a panel ancestor.
export const pw05Nested = form('pw-05-nested-focus', [
  tabs([panels(required('nestedValue', 'Nested hidden value', 'Complete the nested hidden field'))]),
]);
