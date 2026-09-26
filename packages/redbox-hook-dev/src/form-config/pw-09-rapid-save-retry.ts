import type { FormConfigFrame } from '@researchdatabox/sails-ng-common';

const form: FormConfigFrame = {
  name: 'pw-09-rapid-save-retry-1.0-draft',
  type: 'pw-09-rapid-save-retry',
  domElementType: 'form',
  serverSyncOnSave: 'preserveLocalEdits',
  componentDefinitions: [
    {
      name: 'title',
      layout: { class: 'DefaultLayout', config: { label: 'Title' } },
      component: { class: 'SimpleInputComponent' },
      model: { class: 'SimpleInputModel', config: { defaultValue: 'PW-09 rapid save retry' } },
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
