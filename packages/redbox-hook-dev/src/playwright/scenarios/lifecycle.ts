import type { FormConfigFrame } from '@researchdatabox/sails-ng-common';
import type { ActionRegistry, RecordTypeDefinition } from '@researchdatabox/redbox-core';
import { scenarioForm, textField } from '../fields';
import type { ScenarioNames } from '../types';

// Configuration must load before the core runtime is compiled. Contract tests verify these stable IDs.
const writebackBindingIds = {
  'lifecycle-server-writeback': ['actb_8ac6be30084c87bb214be76728203acd', 'actb_0a55af53411930b7c5b38109cc20fc11'],
  'lifecycle-edit-during-save': ['actb_4a287c3795026bc094cd1a59903963b4', 'actb_b99437713b037c45c8d541c761384b36'],
};

export function lifecycleForm(names: ScenarioNames, id: string): FormConfigFrame {
  const form = scenarioForm(names, [textField('title', 'Title', 'Lifecycle record'), textField('notes', 'Notes', 'Original notes'), textField('serverValue', 'Server value', 'Initial value')]);
  form.serverSyncOnSave = 'preserveLocalEdits';
  if (id === 'lifecycle-save-transition') {
    form.componentDefinitions.push({ name: 'submit', component: { class: 'SaveButtonComponent', config: { label: 'Submit record', targetStep: 'submitted', forceSave: true } } });
  }
  if (id === 'lifecycle-server-writeback') {
    for (const mode of ['always', 'never', 'preserveLocalEdits']) {
      form.componentDefinitions.push({ name: `mode-${mode}`, component: { class: 'SaveButtonComponent', config: { label: `Use ${mode}`, targetStep: mode, forceSave: true } } });
    }
  }
  return form;
}

export function lifecycleRecordType(id: string): Partial<RecordTypeDefinition> {
  if (id === 'lifecycle-two-session-conflict') return { concurrentModification: { mode: 'strict' } };
  if (id !== 'lifecycle-server-writeback' && id !== 'lifecycle-edit-during-save') return {};
  return {
    actionPlan: {
      schemaVersion: 1,
      recordTypeKey: `e2e-${id}`,
      // Workflow transitions also execute onUpdate actions.
      bindings: (['onCreate', 'onUpdate'] as const).map((mode, index) => ({
        schemaVersion: 1,
        id: writebackBindingIds[id][index] as ActionRegistry.ActionBindingId,
        stableKey: 'server-write-back',
        actionId: 'redbox.core.record.apply-templates' as ActionRegistry.ActionDefinitionId,
        contractVersion: 1,
        scope: { context: 'record-lifecycle', mode, phase: 'pre' },
        parameters: {
          field: { kind: 'literal', value: 'metadata.serverValue' },
          value: { kind: 'jsonata', expression: '"Server: " & record.candidate.metadata.title' },
          parseObject: { kind: 'literal', value: false },
        },
        order: 0,
      })),
    },
  };
}
