import type { FormConfigFrame } from '@researchdatabox/sails-ng-common';
import type { RecordTypeConfig, WorkflowConfig } from '@researchdatabox/redbox-core';

// Scenario configuration only: no replacement application services or components.
export const manualForms: Record<string, FormConfigFrame> = {};
export const manualRecordTypes: RecordTypeConfig = {};
export const manualWorkflows: WorkflowConfig = {};
const scenarios = ['pw-13-omitted', 'pw-13-empty', 'pw-13-other', 'pw-14-columns', 'pw-19-search'];
for (const type of scenarios) {
  const name = `${type}-1.0-draft`;
  manualForms[name] = {
    name, type, domElementType: 'form',
    componentDefinitions: [
      { name: 'title', layout: { class: 'DefaultLayout', config: { label: 'Title' } }, component: { class: 'SimpleInputComponent' }, model: { class: 'SimpleInputModel' } },
      { name: 'notes', layout: { class: 'DefaultLayout', config: { label: '@pw-20-manual-translation' } }, component: { class: 'SimpleInputComponent' }, model: { class: 'SimpleInputModel' } },
      { name: 'save', component: { class: 'SaveButtonComponent', config: { label: 'Save' } } },
      { name: 'saveStatus', component: { class: 'SaveStatusComponent' } },
    ],
  };
  manualRecordTypes[type] = {
    packageType: type, searchable: true,
    labels: { name: type, namePlural: `${type} records` },
    searchFilters: [{ name: 'text_title', title: 'Title', type: 'exact', typeLabel: 'Contains' }],
  };
  const formatRules = type === 'pw-13-omitted' ? { filterBy: {} }
    : type === 'pw-13-other' ? { filterBy: {}, queryFilters: { unrelated: [] } }
    : { filterBy: {}, queryFilters: {} };
  manualWorkflows[type] = {
    draft: {
      starting: true,
      config: {
        workflow: { stage: 'draft', stageLabel: 'Draft' },
        authorization: { viewRoles: ['Admin'], editRoles: ['Admin'] },
        form: name,
        dashboard: { table: {
          rowConfig: [{ title: 'Original title', variable: 'title', template: '{{metadata.title}}', initialSort: 'asc' }],
          formatRules,
        } },
      },
    },
  };
}

const integrationType = 'pw-22-integrations';
manualRecordTypes[integrationType] = { packageType: integrationType, searchable: true, labels: { name: 'PW-22 integrations', namePlural: 'PW-22 integrations' } };
manualWorkflows[integrationType] = { draft: { starting: true, config: {
  workflow: { stage: 'draft', stageLabel: 'Draft' }, authorization: { viewRoles: ['Admin'], editRoles: ['Admin'] }, form: `${integrationType}-1.0-draft`,
} } };
manualForms[`${integrationType}-1.0-draft`] = {
  name: `${integrationType}-1.0-draft`, type: integrationType, domElementType: 'form', attachmentFields: ['files'],
  componentDefinitions: [
    { name: 'title', layout: { class: 'DefaultLayout', config: { label: 'Title' } }, component: { class: 'SimpleInputComponent' }, model: { class: 'SimpleInputModel', config: { defaultValue: 'PW-22 integration controls' } } },
    { name: 'term', layout: { class: 'DefaultLayout', config: { label: 'Vocabulary term' } }, component: { class: 'TypeaheadInputComponent', config: {
      sourceType: 'static', minChars: 2, debounceMs: 150, requireSelection: true, valueMode: 'optionObject', staticOptions: [
        { label: 'Coastal ecology', value: 'term-coast' }, { label: 'Forest ecology', value: 'term-forest' },
      ],
    } }, model: { class: 'TypeaheadInputModel' } },
    { name: 'files', component: { class: 'FileUploadComponent', config: { enabledSources: [], allowUploadWithoutSave: false } }, model: { class: 'FileUploadModel', config: { defaultValue: [] } } },
    { name: 'save', component: { class: 'SaveButtonComponent', config: { label: 'Save' } } },
    { name: 'saveStatus', component: { class: 'SaveStatusComponent' } },
  ],
};
