import type { FormConfigFrame, FormValidatorConfig, SimpleInputFormComponentDefinitionFrame, TabFormComponentDefinitionFrame, AccordionFormComponentDefinitionFrame } from '@researchdatabox/sails-ng-common';
import { scenarioForm, textField } from '../fields';
import type { ScenarioNames } from '../types';

function validated(name: string, label: string, validators: FormValidatorConfig[], value?: string): SimpleInputFormComponentDefinitionFrame {
  const field = textField(name, label, value);
  field.model = { class: 'SimpleInputModel', config: { defaultValue: value, validators } };
  return field;
}
const required = (message: string, group?: string): FormValidatorConfig => ({ class: 'required', message, ...(group ? { groups: { include: [group] } } : {}) });

export function validationForm(names: ScenarioNames, id: string): FormConfigFrame {
  const form = scenarioForm(names, [textField('title', 'Title', 'Validation record')]);
  const insert = (...fields: FormConfigFrame['componentDefinitions']) => form.componentDefinitions.splice(1, 0, ...fields);
  form.componentDefinitions.unshift({ name: 'errors', component: { class: 'ValidationSummaryComponent', config: { includeTabLabel: true } } });
  form.validationGroups = {
    all: { description: 'All validators', initialMembership: 'all' }, none: { description: 'No validators', initialMembership: 'none' },
    selected: { description: 'Selected validators', initialMembership: 'none' }, conditional: { description: 'Conditional validators', initialMembership: 'none' },
    recommended: { description: 'Recommendations', initialMembership: 'none' }, ordinary: { description: 'Ordinary validation', initialMembership: 'none' }, submit: { description: 'Submission validation', initialMembership: 'none' },
  };
  form.enabledValidationGroups = ['all'];
  if (id === 'validation-fields-cross-field') {
    insert(
      validated('requiredValue', 'Required value', [required('Required value is missing')], ''),
      validated('email', 'Email', [{ class: 'email', message: 'Enter a valid email address' }], 'invalid'),
      textField('left', 'First code', 'same'), textField('right', 'Second code', 'same'),
    );
    form.validators = [{ class: 'different-values', config: { controlNames: ['left', 'right'] }, message: 'The two codes must differ' }];
  } else if (id === 'validation-groups') {
    form.enabledValidationGroups = ['none'];
    const groupExpression = { name: 'groups', config: {
      conditionKind: 'jsonpointer' as const, condition: '/mode::field.value.changed', target: 'form.enabledValidationGroups' as const,
      template: '{"initial":"none", "groups":{"include": [formData.mode = "conditional" ? (formData.extra = "yes" ? ["selected", "conditional"] : ["selected"]) : formData.mode]}}',
    } };
    insert(
      textField('mode', 'Validation mode', 'none', [groupExpression]),
      textField('extra', 'Enable conditional group', 'no', [{ ...groupExpression, name: 'conditional-groups', config: { ...groupExpression.config, condition: '/extra::field.value.changed' } }]),
      validated('requiredValue', 'Required value', [required('Selected group requires a value', 'selected')], ''),
      validated('conditionalValue', 'Conditional value', [required('Conditional group requires a value', 'conditional')], ''),
    );
  } else if (id === 'validation-summaries') {
    form.enabledValidationGroups = ['ordinary'];
    form.validationOperations = { ordinary: { enabledValidationGroups: ['ordinary'] } };
    const save = form.componentDefinitions.find(field => field.component?.class === 'SaveButtonComponent');
    if (save?.component?.class === 'SaveButtonComponent') save.component.config = { ...save.component.config, operation: 'ordinary' };
    const tabs: TabFormComponentDefinitionFrame = { name: 'tabs', layout: { class: 'TabLayout' }, component: { class: 'TabComponent', config: { tabs: [
      { name: 'overview', layout: { class: 'TabContentLayout', config: { buttonLabel: 'Overview' } }, component: { class: 'TabContentComponent', config: { selected: true, componentDefinitions: [textField('overview', 'Overview note', 'Overview')] } } },
      { name: 'details', layout: { class: 'TabContentLayout', config: { buttonLabel: 'Details' } }, component: { class: 'TabContentComponent', config: { componentDefinitions: [validated('tabValue', 'Hidden tab value', [required('Complete the hidden tab', 'ordinary')], '')] } } },
    ] } } };
    const accordion: AccordionFormComponentDefinitionFrame = { name: 'panels', layout: { class: 'AccordionLayout' }, component: { class: 'AccordionComponent', config: { startingOpenMode: 'first-open', panels: [
      { name: 'intro', layout: { class: 'AccordionPanelLayout', config: { buttonLabel: 'Introduction' } }, component: { class: 'AccordionPanelComponent', config: { componentDefinitions: [textField('intro', 'Introduction note', 'Introduction')] } } },
      { name: 'closed', layout: { class: 'AccordionPanelLayout', config: { buttonLabel: 'More details' } }, component: { class: 'AccordionPanelComponent', config: { componentDefinitions: [validated('panelValue', 'Closed panel value', [required('Complete the closed panel', 'ordinary')], '')] } } },
    ] } } };
    insert(validated('requiredValue', 'Required value', [required('Complete the ordinary field', 'ordinary')], ''), tabs, accordion,
      validated('advisoryValue', 'Recommended value', [required('A recommendation remains', 'recommended')], ''),
      { name: 'suggestions', component: { class: 'SuggestedValidationSummaryComponent', config: { enabledValidationGroups: ['recommended'], header: 'Recommendations' } } },
    );
  } else if (id === 'validation-repeatables') {
    insert({ name: 'rows', model: { class: 'RepeatableModel', config: { defaultValue: [
      { label: 'Alpha', email: '' }, { label: 'Beta', email: '' },
    ] } }, component: { class: 'RepeatableComponent', config: { allowZeroRows: true, addButtonShow: true,
      elementTemplate: { name: '', layout: { class: 'RepeatableElementLayout', config: { label: 'Contact' } },
        model: { class: 'GroupModel', config: { newEntryValue: { label: '', email: '' } } },
        component: { class: 'GroupComponent', config: { componentDefinitions: [textField('label', 'Contact name'), validated('email', 'Contact email', [required('Contact email is required'), { class: 'email', message: 'Contact email must be valid' }])] } },
      },
    } } });
  } else {
    form.enabledValidationGroups = ['ordinary'];
    form.validationOperations = { draft: { enabledValidationGroups: ['none'] }, submit: { enabledValidationGroups: ['submit'] } };
    insert(validated('ordinaryValue', 'Ordinary required value', [required('Ordinary validation restored', 'ordinary')], ''),
      validated('submitValue', 'Submission value', [required('Submission value required', 'submit')], ''),
      { name: 'draft', component: { class: 'SaveButtonComponent', config: { label: 'Save draft', operation: 'draft', enabledValidationGroups: ['none'], forceSave: true } } },
      // A permissive local group proves the server still enforces the named submit operation.
      { name: 'submit', component: { class: 'SaveButtonComponent', config: { label: 'Submit for validation', operation: 'submit', enabledValidationGroups: ['none'], forceSave: true } } },
    );
  }
  return form;
}
