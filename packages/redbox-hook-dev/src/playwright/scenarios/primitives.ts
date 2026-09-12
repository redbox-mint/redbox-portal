import type { FormConfigFrame } from '@researchdatabox/sails-ng-common';
import { scenarioForm, textField } from '../fields';
import type { ScenarioNames } from '../types';

export function primitiveForm(names: ScenarioNames, id: string): FormConfigFrame {
  const fields: FormConfigFrame['componentDefinitions'] = [textField('title', 'Title', 'Component values')];
  if (id === 'components-date') {
    fields.push({ name: 'date', layout: { class: 'DefaultLayout', config: { label: 'Review date' } },
      component: { class: 'DateInputComponent', config: { dateFormat: 'YYYY-MM-DD', robustParsing: true, showWeekNumbers: false } }, model: { class: 'DateInputModel' },
    });
  } else {
    fields.push(
      textField('text', 'Text value', 'Initial text'),
      { ...textField('number', 'Number value', '7'), component: { class: 'SimpleInputComponent', config: { type: 'number' } } },
      { name: 'description', layout: { class: 'DefaultLayout', config: { label: 'Description' } }, component: { class: 'TextAreaComponent', config: { rows: 4, cols: 60 } }, model: { class: 'TextAreaModel', config: { defaultValue: 'Initial description' } } },
      { name: 'enabled', component: { class: 'CheckboxInputComponent', config: { booleanMode: true, options: [{ label: 'Enabled', value: 'true' }] } }, model: { class: 'CheckboxInputModel', config: { defaultValue: false } } },
      { name: 'radio', component: { class: 'RadioInputComponent', config: { options: [{ label: 'Alpha', value: 'alpha' }, { label: 'Beta', value: 'beta' }] } }, model: { class: 'RadioInputModel', config: { defaultValue: 'alpha' } } },
      { name: 'choice', layout: { class: 'DefaultLayout', config: { label: 'Choice' } }, component: { class: 'DropdownInputComponent', config: { options: [{ label: 'One', value: 'one' }, { label: 'Two', value: 'two' }] } }, model: { class: 'DropdownInputModel', config: { defaultValue: 'one' } } },
    );
  }
  return scenarioForm(names, fields);
}
