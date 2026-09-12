import { scenarioForm, textField } from '../fields';
import type { ScenarioNames } from '../types';

export function initialisationForm(names: ScenarioNames) {
  return scenarioForm(names, [
    textField('title', 'Title', 'Initial title'),
    textField('description', 'Calculated description', '', [{
      name: 'initial-calculation',
      config: {
        conditionKind: 'jsonpointer', condition: '/title::field.value.changed',
        template: 'formData.title & " / calculated"', target: 'model.value',
      },
    }]),
    textField('translated', '@rdmp-title-label', 'Translated field'),
    textField('translationExample', '@playwright-regression-translation', 'Translation sample'),
  ]);
}
