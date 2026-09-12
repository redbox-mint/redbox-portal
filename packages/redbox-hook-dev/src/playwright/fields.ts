import type {
  FormConfigFrame,
  FormExpressionsConfigFrame,
  SimpleInputFormComponentDefinitionFrame,
  SaveButtonFormComponentDefinitionFrame,
} from '@researchdatabox/sails-ng-common';
import type { ScenarioNames } from './types';

export function textField(
  name: string,
  label: string,
  defaultValue?: string,
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

export function saveButton(): SaveButtonFormComponentDefinitionFrame {
  return {
    name: 'save',
    constraints: { allowModes: ['edit'] },
    component: { class: 'SaveButtonComponent', config: { label: 'Save', labelSaving: 'Saving…' } },
  };
}

export function scenarioForm(names: ScenarioNames, fields: FormConfigFrame['componentDefinitions']): FormConfigFrame {
  return {
    name: names.formName,
    type: names.recordType,
    domElementType: 'form',
    componentDefinitions: [...fields, saveButton(), { name: 'saveStatus', component: { class: 'SaveStatusComponent' } }],
  };
}
