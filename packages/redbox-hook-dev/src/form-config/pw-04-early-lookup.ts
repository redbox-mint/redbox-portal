import type {
  FormConfigFrame,
  FormExpressionsConfigFrame,
  SimpleInputFormComponentDefinitionFrame,
} from '@researchdatabox/sails-ng-common';

function textField(
  name: string,
  label: string,
  defaultValue: string,
  expressions: FormExpressionsConfigFrame[] = []
): SimpleInputFormComponentDefinitionFrame {
  return {
    name,
    layout: { class: 'DefaultLayout', config: { label } },
    component: { class: 'SimpleInputComponent' },
    model: { class: 'SimpleInputModel', config: { defaultValue } },
    expressions,
  };
}

// F09's events-errors recipe, including the dependent expression that loads compiled items.
const form: FormConfigFrame = {
  name: 'pw-04-early-lookup-1.0-draft',
  type: 'pw-04-early-lookup',
  domElementType: 'form',
  componentDefinitions: [
    textField('title', 'Title', 'PW-04 early lookup'),
    textField('lookup', 'Lookup record', ''),
    textField('result', 'Lookup result', 'Waiting'),
    textField('dependent', 'Event result', 'Waiting', [
      {
        name: 'event-result',
        config: {
          conditionKind: 'jsonpointer',
          condition: '/result::field.value.changed',
          template: 'formData.result & " / event"',
          target: 'model.value',
          runOnFormReady: false,
        },
      },
    ]),
    textField('disabledResult', 'Disabled result', 'Unchanged'),
    {
      name: 'save',
      constraints: { allowModes: ['edit'] },
      component: { class: 'SaveButtonComponent', config: { label: 'Save', labelSaving: 'Saving…' } },
    },
    { name: 'saveStatus', component: { class: 'SaveStatusComponent' } },
  ],
  behaviours: [
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
        { type: 'setValue', config: { fieldPath: '/result' } },
        { type: 'emitEvent', config: { eventType: 'field.value.changed', fieldId: '/result', sourceId: '*' } },
      ],
      onError: [{ type: 'setValue', config: { fieldPath: '/result', valueTemplate: '"Lookup failed"' } }],
    },
  ],
};

export default form;
