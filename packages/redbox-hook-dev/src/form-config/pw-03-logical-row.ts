import type { FormConfigFrame, SimpleInputFormComponentDefinitionFrame } from '@researchdatabox/sails-ng-common';

function textField(name: string, label: string, defaultValue?: string): SimpleInputFormComponentDefinitionFrame {
  return {
    name,
    layout: { class: 'DefaultLayout', config: { label } },
    component: { class: 'SimpleInputComponent' },
    model: { class: 'SimpleInputModel', config: defaultValue === undefined ? {} : { defaultValue } },
  };
}

function form(type: string, fields: FormConfigFrame['componentDefinitions']): FormConfigFrame {
  return {
    name: `${type}-1.0-draft`,
    type,
    domElementType: 'form',
    componentDefinitions: [
      ...fields,
      {
        name: 'save',
        constraints: { allowModes: ['edit'] },
        component: { class: 'SaveButtonComponent', config: { label: 'Save', labelSaving: 'Saving…' } },
      },
      { name: 'saveStatus', component: { class: 'SaveStatusComponent' } },
    ],
  };
}

export const pw03Source = form('pw-03-source', [textField('title', 'Title', 'Delayed row metadata')]);

// F10's logical-row lookup, without unrelated demonstration fields.
export const pw03LogicalRow = form('pw-03-logical-row', [
  textField('title', 'Title', 'PW-03 logical row'),
  textField('lookup', 'Lookup record', ''),
  {
    name: 'rows',
    model: {
      class: 'RepeatableModel',
      config: {
        defaultValue: [
          { label: 'Alpha', result: 'Waiting A' },
          { label: 'Beta', result: 'Waiting B' },
          { label: 'Gamma', result: 'Waiting C' },
        ],
      },
    },
    component: {
      class: 'RepeatableComponent',
      config: {
        allowZeroRows: true,
        elementTemplate: {
          name: '',
          layout: { class: 'RepeatableElementLayout' },
          model: { class: 'GroupModel' },
          component: {
            class: 'GroupComponent',
            config: { componentDefinitions: [textField('label', 'Row label'), textField('result', 'Row result')] },
          },
        },
      },
    },
  },
  textField('result', 'Lookup result', 'Waiting'),
]);

pw03LogicalRow.behaviours = [
  {
    name: 'lookup',
    enabled: true,
    runOnFormReady: false,
    conditionKind: 'jsonata',
    condition: 'event.type = "field.value.changed" and event.fieldId = "/lookup"',
    processors: [
      { type: 'jsonataTransform', config: { template: '$trim(formData.lookup)' } },
      { type: 'fetchMetadata' },
      { type: 'jsonataTransform', config: { template: 'value.title & " / fetched"' } },
    ],
    actions: [
      { type: 'setValue', config: { fieldPath: '/rows/1/result', fieldPathKind: 'logical' } },
      { type: 'setValue', config: { fieldPath: '/result', valueTemplate: '"Lookup complete"' } },
    ],
    onError: [{ type: 'setValue', config: { fieldPath: '/result', valueTemplate: '"Lookup failed"' } }],
  },
];
