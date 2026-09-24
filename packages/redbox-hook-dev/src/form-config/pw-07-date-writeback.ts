import type { FormConfigFrame } from '@researchdatabox/sails-ng-common';

function dateForm(type: string): FormConfigFrame {
  return {
    name: `${type}-1.0-draft`,
    type,
    domElementType: 'form',
    serverSyncOnSave: 'preserveLocalEdits',
    componentDefinitions: [
      {
        name: 'title',
        layout: { class: 'DefaultLayout', config: { label: 'Title' } },
        component: { class: 'SimpleInputComponent' },
        model: { class: 'SimpleInputModel', config: { defaultValue: type } },
      },
      {
        name: 'date',
        layout: { class: 'DefaultLayout', config: { label: 'Review date' } },
        component: {
          class: 'DateInputComponent',
          config: { dateFormat: 'YYYY-MM-DD', robustParsing: true, showWeekNumbers: false },
        },
        model: { class: 'DateInputModel', config: { defaultValue: new Date('2026-10-03T00:00:00.000Z') } },
      },
      {
        name: 'save',
        constraints: { allowModes: ['edit'] },
        component: { class: 'SaveButtonComponent', config: { label: 'Save', labelSaving: 'Saving…' } },
      },
      { name: 'saveStatus', component: { class: 'SaveStatusComponent' } },
    ],
  };
}

// F20's date field. The second record type normalizes ISO notation on update
// without changing the instant, so the server returns a different field value.
export const pw07DateControl = dateForm('pw-07-date-control');
export const pw07DateWriteback = dateForm('pw-07-date-writeback');
