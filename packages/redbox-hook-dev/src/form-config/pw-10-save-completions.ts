import type { FormConfigFrame } from '@researchdatabox/sails-ng-common';

const form: FormConfigFrame = {
  name: 'pw-10-save-completions-1.0-draft',
  type: 'pw-10-save-completions',
  domElementType: 'form',
  serverSyncOnSave: 'preserveLocalEdits',
  componentDefinitions: [
    {
      name: 'title',
      layout: { class: 'DefaultLayout', config: { label: 'Title' } },
      component: { class: 'SimpleInputComponent' },
      model: { class: 'SimpleInputModel', config: { defaultValue: 'PW-10 save completions' } },
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
