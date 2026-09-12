import type { FormConfigFrame, FormExpressionsConfigFrame } from '@researchdatabox/sails-ng-common';
import { scenarioForm, textField } from '../fields';
import type { ScenarioNames } from '../types';

const derived = (name: string, condition: string, template: string): FormExpressionsConfigFrame => ({
  name,
  config: { conditionKind: 'jsonpointer', condition, template, target: 'model.value' },
});

export function expressionForm(names: ScenarioNames, id: string): FormConfigFrame {
  const title = textField('title', 'Title', 'Ready');
  if (id === 'expression-conditions') {
    return scenarioForm(names, [
      title,
      textField('unrelated', 'Unrelated', 'untouched'),
      textField('pointerResult', 'Pointer result', '', [derived('pointer', '/title::field.value.changed', 'formData.title & " / pointer"')]),
      textField('jsonataResult', 'JSONata result', 'no match', [{
        name: 'jsonata',
        config: {
          conditionKind: 'jsonata', condition: '$contains(formData.title, "match")',
          template: 'formData.title & " / jsonata"', target: 'model.value',
        },
      }]),
      textField('queryResult', 'Query result', 'no match', [{
        name: 'query',
        config: {
          conditionKind: 'jsonata_query',
          condition: '$exists(querySource.**[name="title"]) and $contains(formData.title, "query")',
          template: 'formData.title & " / query"', target: 'model.value',
        },
      }]),
    ]);
  }
  if (id === 'expression-chaining') {
    return scenarioForm(names, [
      title,
      textField('first', 'First derived', '', [derived('first', '/title::field.value.changed', 'formData.title & " / first"')]),
      textField('second', 'Second derived', '', [derived('second', '/first::field.value.changed', 'formData.first & " / second"')]),
      textField('visibility', 'Visibility', 'show'),
      textField('editable', 'Editable', 'yes'),
      textField('controlled', 'Controlled value', 'retained', [
        { name: 'visible', config: { conditionKind: 'jsonpointer', condition: '/visibility::field.value.changed', template: 'formData.visibility = "show"', target: 'field.visible' } },
        { name: 'disabled', config: { conditionKind: 'jsonpointer', condition: '/editable::field.value.changed', template: 'formData.editable != "yes"', target: 'field.disabled' } },
      ]),
    ]);
  }
  return scenarioForm(names, [title, {
    name: 'rows',
    model: { class: 'RepeatableModel', config: { defaultValue: [{ source: 'Alpha' }, { source: 'Beta' }] } },
    expressions: [{ name: 'row-results', config: {
      conditionKind: 'jsonata',
      condition: '(event.sourceId = "form.definition.ready" and event.fieldId = "/rows") or (event.sourceId = "*" and $contains(event.fieldId, /\\/source$/))',
      template: '[formData.rows.{"source": source, "result": source & " / row"}]',
      target: 'model.value',
    } }],
    component: { class: 'RepeatableComponent', config: {
      allowZeroRows: true,
      elementTemplate: {
        name: '',
        layout: { class: 'RepeatableElementLayout' },
        model: { class: 'GroupModel' },
        component: { class: 'GroupComponent', config: { componentDefinitions: [
          textField('source', 'Row source'),
          textField('result', 'Row result'),
        ] } },
      },
    } },
  }]);
}
