import type { FormBehaviourConfigFrame, FormConfigFrame } from '@researchdatabox/sails-ng-common';
import { scenarioForm, textField } from '../fields';
import type { ScenarioNames } from '../types';

export function behaviourForm(names: ScenarioNames, id: string): FormConfigFrame {
  const form = scenarioForm(names, [
    textField('title', 'Title', 'Behaviour record'),
    textField('lookup', 'Lookup record', ''),
    textField('result', 'Lookup result', 'Waiting'),
    textField('dependent', 'Event result', 'Waiting', [{ name: 'event-result', config: {
      conditionKind: 'jsonpointer', condition: '/result::field.value.changed',
      template: 'formData.result & " / event"', target: 'model.value', runOnFormReady: false,
    } }]),
    textField('disabledResult', 'Disabled result', 'Unchanged'),
  ]);
  const lookup: FormBehaviourConfigFrame = {
    name: 'lookup', enabled: true, runOnFormReady: false,
    conditionKind: 'jsonata', condition: 'event.type = "field.value.changed" and event.fieldId = "/lookup"',
    processors: [
      { type: 'jsonataTransform', config: { template: '$trim(formData.lookup)' } },
      { type: 'fetchMetadata' },
      { type: 'jsonataTransform', config: { template: 'value.title & " / fetched"' } },
    ],
    actions: [{ type: 'setValue', config: { fieldPath: '/result' } }],
    onError: [{ type: 'setValue', config: { fieldPath: '/result', valueTemplate: '"Lookup failed"' } }],
  };
  if (id === 'behaviour-ready-enabled') {
    form.behaviours = [
      { ...lookup, name: 'ready', conditionKind: 'jsonata', condition: 'true', runOnFormReady: true,
        processors: [{ type: 'jsonataTransform', config: { template: 'formData.title & " / ready"' } }],
      },
      { ...lookup, name: 'disabled', conditionKind: 'jsonata', condition: 'true', enabled: false, runOnFormReady: true,
        actions: [{ type: 'setValue', config: { fieldPath: '/disabledResult', valueTemplate: '"Must not run"' } }],
      },
    ];
  } else if (id === 'behaviour-logical-row') {
    form.componentDefinitions.splice(2, 0, {
      name: 'rows', model: { class: 'RepeatableModel', config: { defaultValue: [
        { label: 'Alpha', result: 'Waiting A' }, { label: 'Beta', result: 'Waiting B' }, { label: 'Gamma', result: 'Waiting C' },
      ] } },
      component: { class: 'RepeatableComponent', config: {
        allowZeroRows: true,
        elementTemplate: { name: '', layout: { class: 'RepeatableElementLayout' }, model: { class: 'GroupModel' },
          component: { class: 'GroupComponent', config: { componentDefinitions: [
            textField('label', 'Row label'), textField('result', 'Row result'),
          ] } },
        },
      } },
    });
    lookup.actions = [
      { type: 'setValue', config: { fieldPath: '/rows/1/result', fieldPathKind: 'logical' } },
      { type: 'setValue', config: { fieldPath: '/result', valueTemplate: '"Lookup complete"' } },
    ];
    form.behaviours = [lookup];
  } else {
    if (id === 'behaviour-debounce') {
      lookup.debounceMs = 500;
      lookup.conditionKind = 'jsonpointer';
      lookup.condition = '/lookup::field.value.changed';
    }
    if (id === 'behaviour-events-errors') lookup.actions.push({ type: 'emitEvent', config: {
      eventType: 'field.value.changed', fieldId: '/result', sourceId: '*',
    } });
    form.behaviours = [lookup];
  }
  return form;
}
