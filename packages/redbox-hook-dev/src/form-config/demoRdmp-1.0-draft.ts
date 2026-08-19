import { FormConfigFrame } from '@researchdatabox/sails-ng-common';

type ComponentDefinition = FormConfigFrame['componentDefinitions'][number];

function field(name: string, label: string, helpText: string, multiline = true): ComponentDefinition {
  return multiline ? {
    name,
    layout: { class: 'DefaultLayout', config: { label, helpText } },
    model: { class: 'TextAreaModel', config: { defaultValue: '' } },
    component: { class: 'TextAreaComponent', config: { rows: 5, cols: 80 } },
  } : {
    name,
    layout: { class: 'DefaultLayout', config: { label, helpText } },
    model: { class: 'SimpleInputModel', config: { defaultValue: '' } },
    component: { class: 'SimpleInputComponent' },
  };
}

const formConfig: FormConfigFrame = {
  name: 'demoRdmp-1.0-draft',
  type: 'demoRdmp',
  domElementType: 'form',
  editCssClasses: 'redbox-form form',
  defaultComponentConfig: { defaultComponentCssClasses: 'row' },
  componentDefinitions: [
    {
      name: 'researchActivity',
      layout: { class: 'DefaultLayout', config: { label: 'generation-demo-source-activity', helpText: 'generation-demo-source-activity-help' } },
      model: { class: 'GroupModel', config: { defaultValue: {} } },
      component: { class: 'GroupComponent', config: { componentDefinitions: [
        {
          name: 'oid',
          model: { class: 'SimpleInputModel', config: { defaultValue: '' } },
          component: { class: 'SimpleInputComponent', config: { readonly: true } },
        },
      ] } },
    },
    field('title', 'generation-demo-rdmp-title', 'generation-demo-rdmp-title-help', false),
    field('projectSummary', 'generation-demo-rdmp-summary', 'generation-demo-rdmp-summary-help'),
    field('dataDescription', 'generation-demo-rdmp-data-description', 'generation-demo-rdmp-data-description-help'),
    {
      name: 'dataTypes',
      layout: { class: 'DefaultLayout', config: { label: 'generation-demo-rdmp-data-types', helpText: 'generation-demo-rdmp-data-types-help' } },
      model: { class: 'CheckboxInputModel', config: { defaultValue: [] } },
      component: { class: 'CheckboxInputComponent', config: { multipleValues: true, options: [
        { label: 'generation-demo-data-survey', value: 'De-identified survey responses' },
        { label: 'generation-demo-data-interview', value: 'Synthetic interview transcripts' },
        { label: 'generation-demo-data-statistics', value: 'Aggregate statistics' },
      ] } },
    },
    field('storageApproach', 'generation-demo-rdmp-storage', 'generation-demo-rdmp-storage-help'),
    field('sharingAccess', 'generation-demo-rdmp-sharing', 'generation-demo-rdmp-sharing-help'),
    field('retentionDisposal', 'generation-demo-rdmp-retention', 'generation-demo-rdmp-retention-help'),
    {
      name: 'sensitivityClassification',
      layout: { class: 'DefaultLayout', config: { label: 'generation-demo-rdmp-sensitivity', helpText: 'generation-demo-rdmp-sensitivity-help' } },
      model: { class: 'DropdownInputModel', config: { defaultValue: 'internal' } },
      component: { class: 'DropdownInputComponent', config: { options: [
        { label: 'generation-demo-class-public', value: 'public' },
        { label: 'generation-demo-class-internal', value: 'internal' },
        { label: 'generation-demo-class-restricted', value: 'restricted' },
      ] } },
    },
    field('ethicsStatement', 'generation-demo-rdmp-ethics', 'generation-demo-rdmp-ethics-help'),
    {
      name: 'saveButton',
      component: { class: 'SaveButtonComponent', config: { label: 'save', labelSaving: 'saving' } },
    },
  ],
};

export default formConfig;
