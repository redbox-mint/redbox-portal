import type { FormConfigFrame, SimpleInputFormComponentDefinitionFrame } from '@researchdatabox/sails-ng-common';

// Manual PW-02 recipes from F05, F14 and F17; application code stays at baseline.
function textField(name: string, label: string, defaultValue?: string): SimpleInputFormComponentDefinitionFrame {
  return {
    name,
    layout: { class: 'DefaultLayout', config: { label } },
    component: { class: 'SimpleInputComponent' },
    model: { class: 'SimpleInputModel', config: { defaultValue } },
  };
}

function form(type: string, fields: FormConfigFrame['componentDefinitions']): FormConfigFrame {
  return {
    name: `${type}-1.0-draft`,
    type,
    domElementType: 'form',
    componentDefinitions: [
      textField('title', 'Title', type),
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

export const pw02Calculations = form('pw-02-calculations', [
  {
    name: 'rows',
    model: { class: 'RepeatableModel', config: { defaultValue: [{ source: 'Alpha' }, { source: 'Beta' }] } },
    expressions: [
      {
        name: 'row-results',
        config: {
          conditionKind: 'jsonata',
          condition:
            '(event.sourceId = "form.definition.ready" and event.fieldId = "/rows") or (event.sourceId = "*" and $contains(event.fieldId, /\\/source$/))',
          template: '[formData.rows.{"source": source, "result": source & " / row"}]',
          target: 'model.value',
        },
      },
    ],
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
            config: { componentDefinitions: [textField('source', 'Row source'), textField('result', 'Row result')] },
          },
        },
      },
    },
  },
]);

const email = textField('email', 'Contact email');
email.model = {
  class: 'SimpleInputModel',
  config: {
    validators: [
      { class: 'required', message: 'Contact email is required' },
      { class: 'email', message: 'Contact email must be valid' },
    ],
  },
};

export const pw02Validation = form('pw-02-validation', [
  { name: 'errors', component: { class: 'ValidationSummaryComponent', config: { includeTabLabel: true } } },
  {
    name: 'rows',
    model: {
      class: 'RepeatableModel',
      config: {
        defaultValue: [
          { label: 'Alpha', email: 'alpha@example.test' },
          { label: 'Beta', email: 'beta@example.test' },
        ],
      },
    },
    component: {
      class: 'RepeatableComponent',
      config: {
        allowZeroRows: true,
        addButtonShow: true,
        elementTemplate: {
          name: '',
          layout: { class: 'RepeatableElementLayout', config: { label: 'Contact' } },
          model: { class: 'GroupModel', config: { newEntryValue: { label: '', email: '' } } },
          component: {
            class: 'GroupComponent',
            config: { componentDefinitions: [textField('label', 'Contact name'), email] },
          },
        },
      },
    },
  },
]);
pw02Validation.validationGroups = { all: { description: 'All validators', initialMembership: 'all' } };
pw02Validation.enabledValidationGroups = ['all'];

export const pw02Nested = form('pw-02-nested', [
  {
    name: 'teams',
    model: {
      class: 'RepeatableModel',
      config: {
        defaultValue: [
          {
            name: 'Alpha',
            members: [
              { name: 'Alice', email: 'alice@example.test' },
              { name: 'Anne', email: 'anne@example.test' },
            ],
          },
          { name: 'Beta', members: [{ name: 'Bob', email: 'bob@example.test' }] },
        ],
      },
    },
    component: {
      class: 'RepeatableComponent',
      config: {
        allowZeroRows: true,
        addButtonShow: true,
        elementTemplate: {
          name: '',
          layout: { class: 'RepeatableElementLayout', config: { label: 'Team' } },
          model: { class: 'GroupModel', config: { newEntryValue: { name: '', members: [] } } },
          component: {
            class: 'GroupComponent',
            config: {
              componentDefinitions: [
                textField('name', 'Team name'),
                {
                  name: 'members',
                  model: { class: 'RepeatableModel' },
                  component: {
                    class: 'RepeatableComponent',
                    config: {
                      allowZeroRows: true,
                      addButtonShow: true,
                      elementTemplate: {
                        name: '',
                        layout: { class: 'RepeatableElementLayout' },
                        model: { class: 'GroupModel' },
                        component: {
                          class: 'GroupComponent',
                          config: {
                            componentDefinitions: [
                              textField('name', 'Member name'),
                              textField('email', 'Member email'),
                            ],
                          },
                        },
                      },
                    },
                  },
                },
              ],
            },
          },
        },
      },
    },
  },
]);
