import { FormConfigFrame } from '@researchdatabox/sails-ng-common';

type ComponentDefinition = FormConfigFrame['componentDefinitions'][number];

function textField(name: string, label: string, helpText: string, multiline = false): ComponentDefinition {
  return multiline ? {
    name,
    layout: { class: 'DefaultLayout', config: { label, helpText } },
    model: { class: 'TextAreaModel', config: { defaultValue: '' } },
    component: { class: 'TextAreaComponent', config: { rows: 4, cols: 80 } },
  } : {
    name,
    layout: { class: 'DefaultLayout', config: { label, helpText } },
    model: { class: 'SimpleInputModel', config: { defaultValue: '' } },
    component: { class: 'SimpleInputComponent' },
  };
}

const formConfig: FormConfigFrame = {
  name: 'researchActivity-1.0-draft',
  type: 'researchActivity',
  domElementType: 'form',
  editCssClasses: 'redbox-form form',
  defaultComponentConfig: { defaultComponentCssClasses: 'row' },
  componentDefinitions: [
    {
      name: 'demoNotice',
      component: {
        class: 'ContentComponent',
        config: {
          content: 'generation-demo-activity-notice',
          contentIsTranslationCode: true,
        },
      },
    },
    textField('title', 'generation-demo-activity-title', 'generation-demo-activity-title-help'),
    textField('plainLanguageSummary', 'generation-demo-activity-summary', 'generation-demo-activity-summary-help', true),
    textField('objectives', 'generation-demo-activity-objectives', 'generation-demo-activity-objectives-help', true),
    textField('methods', 'generation-demo-activity-methods', 'generation-demo-activity-methods-help', true),
    {
      name: 'humanParticipants',
      layout: { class: 'DefaultLayout', config: { label: 'generation-demo-human-participants', helpText: 'generation-demo-human-participants-help' } },
      model: { class: 'CheckboxInputModel', config: { defaultValue: false } },
      component: { class: 'CheckboxInputComponent', config: { booleanMode: true, multipleValues: false } },
    },
    {
      name: 'sensitiveData',
      layout: { class: 'DefaultLayout', config: { label: 'generation-demo-sensitive-data', helpText: 'generation-demo-sensitive-data-help' } },
      model: { class: 'CheckboxInputModel', config: { defaultValue: false } },
      component: { class: 'CheckboxInputComponent', config: { booleanMode: true, multipleValues: false } },
    },
    {
      name: 'expectedDataTypes',
      layout: { class: 'DefaultLayout', config: { label: 'generation-demo-data-types', helpText: 'generation-demo-data-types-help' } },
      model: { class: 'CheckboxInputModel', config: { defaultValue: [] } },
      component: { class: 'CheckboxInputComponent', config: { multipleValues: true, options: [
        { label: 'generation-demo-data-survey', value: 'De-identified survey responses' },
        { label: 'generation-demo-data-interview', value: 'Synthetic interview transcripts' },
        { label: 'generation-demo-data-statistics', value: 'Aggregate statistics' },
      ] } },
    },
    textField('ethicsStatus', 'generation-demo-ethics-status', 'generation-demo-ethics-status-help'),
    {
      name: 'saveButton',
      component: { class: 'SaveButtonComponent', config: { label: 'save', labelSaving: 'saving' } },
    },
  ],
};

export default formConfig;
