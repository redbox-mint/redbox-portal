import type { FormConfigFrame } from '@researchdatabox/sails-ng-common';
import type { RecordTypeDefinition } from '@researchdatabox/redbox-core';
import { scenarioForm, textField } from '../fields';
import type { ScenarioNames } from '../types';

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
  const pre = [{ function: 'sails.services.rdmpservice.runTemplates', options: { parseObject: false, templates: [
    { field: 'metadata.serverValue', template: 'Server: <%= record.metadata.title %>' },
  ] } }];
  return { hooks: { onCreate: { pre }, onUpdate: { pre }, onTransitionWorkflow: { pre } } };
}
