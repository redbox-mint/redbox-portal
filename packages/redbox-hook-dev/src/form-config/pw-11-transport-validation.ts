import type { FormConfigFrame } from '@researchdatabox/sails-ng-common';

const form: FormConfigFrame = {
  name: 'pw-11-transport-validation-1.0-draft',
  type: 'pw-11-transport-validation',
  domElementType: 'form',
  serverSyncOnSave: 'preserveLocalEdits',
  componentDefinitions: [
    {
      name: 'errors',
      component: { class: 'ValidationSummaryComponent', config: { showWhenValid: true } },
    },
    {
      name: 'title',
      layout: { class: 'DefaultLayout', config: { label: 'Title' } },
      component: { class: 'SimpleInputComponent' },
      model: {
        class: 'SimpleInputModel',
        config: {
          defaultValue: 'PW-11 transport validation',
          validators: [{ class: 'required', message: 'Title is required' }],
        },
      },
    },
    {
      name: 'notes',
      layout: { class: 'DefaultLayout', config: { label: 'Notes' } },
      component: { class: 'SimpleInputComponent' },
      model: { class: 'SimpleInputModel', config: { defaultValue: 'Original notes' } },
    },
    {
      name: 'save',
      constraints: { allowModes: ['edit'] },
      component: { class: 'SaveButtonComponent', config: { label: 'Save', labelSaving: 'Saving…' } },
    },
    { name: 'saveStatus', component: { class: 'SaveStatusComponent' } },
  ],
};

export default form;
