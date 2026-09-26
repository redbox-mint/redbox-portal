import type { FormConfigFrame } from '@researchdatabox/sails-ng-common';

// Manual reproduction of PW-01 on the pre-Playwright baseline.
const formConfig: FormConfigFrame = {
  name: 'pw-01-expression-chaining-1.0-draft',
  type: 'pw-01-expression-chaining',
  domElementType: 'form',
  componentDefinitions: [
    {
      name: 'title',
      layout: { class: 'DefaultLayout', config: { label: 'Title' } },
      component: { class: 'SimpleInputComponent' },
      model: { class: 'SimpleInputModel', config: { defaultValue: 'Ready' } },
    },
    {
      name: 'first',
      layout: { class: 'DefaultLayout', config: { label: 'First derived' } },
      component: { class: 'SimpleInputComponent' },
      model: { class: 'SimpleInputModel', config: { defaultValue: '' } },
      expressions: [
        {
          name: 'first',
          config: {
            conditionKind: 'jsonpointer',
            condition: '/title::field.value.changed',
            template: 'formData.title & " / first"',
            target: 'model.value',
          },
        },
      ],
    },
    {
      name: 'second',
      layout: { class: 'DefaultLayout', config: { label: 'Second derived' } },
      component: { class: 'SimpleInputComponent' },
      model: { class: 'SimpleInputModel', config: { defaultValue: '' } },
      expressions: [
        {
          name: 'second',
          config: {
            conditionKind: 'jsonpointer',
            condition: '/first::field.value.changed',
            template: 'formData.first & " / second"',
            target: 'model.value',
          },
        },
      ],
    },
    {
      name: 'save',
      constraints: { allowModes: ['edit'] },
      component: { class: 'SaveButtonComponent', config: { label: 'Save', labelSaving: 'Saving…' } },
    },
    { name: 'saveStatus', component: { class: 'SaveStatusComponent' } },
  ],
};

export default formConfig;
