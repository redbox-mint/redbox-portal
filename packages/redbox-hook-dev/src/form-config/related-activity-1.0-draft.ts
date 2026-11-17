import type { FormConfigFrame } from '@researchdatabox/sails-ng-common';

const form: FormConfigFrame = {
  name: 'related-activity-1.0-draft',
  type: 'related-activity',
  domElementType: 'form',
  componentDefinitions: [
    {
      name: 'title',
      layout: { class: 'DefaultLayout', config: { label: 'Activity title' } },
      model: { class: 'SimpleInputModel', config: { defaultValue: '' } },
      component: { class: 'SimpleInputComponent' },
    },
    ...['startDate', 'endDate'].map((name): NonNullable<FormConfigFrame['componentDefinitions']>[number] => ({
      name,
      layout: { class: 'DefaultLayout', config: { label: name } },
      model: { class: 'DateInputModel', config: { dateOnly: true } },
      component: { class: 'DateInputComponent' },
    })),
    { name: 'save', component: { class: 'SaveButtonComponent', config: { label: 'Save activity' } } },
    { name: 'status', component: { class: 'SaveStatusComponent' } },
  ],
};
export default form;
