import type { FormConfigFrame } from '@researchdatabox/sails-ng-common';
import type { RecordTypeConfig, WorkflowConfig } from '@researchdatabox/redbox-core';
import type { PlaywrightScenario, ScenarioNames, ScenarioRegistration } from './types';
import { expressionForm } from './scenarios/expressions';
import { initialisationForm } from './scenarios/initialisation';
import { behaviourForm } from './scenarios/behaviours';
import { validationForm } from './scenarios/validation';
import { structureForm } from './scenarios/structure';
import { primitiveForm } from './scenarios/primitives';
import { integrationComponentForm } from './scenarios/components';
import { lifecycleForm } from './scenarios/lifecycle';

const scenarioPrefix = 'e2e-';

export function namesForScenario(id: string): ScenarioNames {
  const slug = id
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-');
  if (!slug) {
    throw new Error('Playwright scenario IDs must contain at least one letter or number.');
  }
  return {
    recordType: `${scenarioPrefix}${slug}`,
    formName: `${scenarioPrefix}${slug}-1.0-draft`,
    workflowStage: 'draft',
  };
}

/** Build a small, valid form. Individual scenarios can extend this factory
 * with normal FormConfigFrame properties without coupling the browser harness
 * to Angular implementation details. */
export function buildScenarioForm(names: ScenarioNames, scenarioId = ''): FormConfigFrame {
  if (scenarioId.startsWith('expression-')) return expressionForm(names, scenarioId);
  if (scenarioId.startsWith('initialisation-')) return initialisationForm(names);
  if (scenarioId.startsWith('behaviour-')) return behaviourForm(names, scenarioId);
  if (scenarioId.startsWith('validation-')) return validationForm(names, scenarioId);
  if (scenarioId.startsWith('structure-')) return structureForm(names, scenarioId);
  if (scenarioId === 'components-basic' || scenarioId === 'components-date') return primitiveForm(names, scenarioId);
  if (scenarioId.startsWith('components-')) return integrationComponentForm(names, scenarioId);
  if (scenarioId.startsWith('lifecycle-')) return lifecycleForm(names, scenarioId);
  throw new Error(`No form factory for Playwright scenario '${scenarioId}'.`);
}

export function buildScenarioRegistration(scenarios: readonly PlaywrightScenario[]): ScenarioRegistration {
  const recordtype: RecordTypeConfig = {};
  const workflow: WorkflowConfig = {};
  const forms: Record<string, FormConfigFrame> = {};

  for (const scenario of scenarios) {
    const names = namesForScenario(scenario.id);
    if (recordtype[names.recordType] || forms[names.formName]) {
      throw new Error(`Duplicate generated Playwright scenario name '${names.recordType}'.`);
    }

    const form = scenario.form(names);
    if (form.name !== names.formName) {
      throw new Error(`Scenario '${scenario.id}' returned form '${form.name}', expected '${names.formName}'.`);
    }
    if (form.type && form.type !== names.recordType) {
      throw new Error(`Scenario '${scenario.id}' form type '${form.type}' does not match '${names.recordType}'.`);
    }

    const recordDefinition = {
      packageType: names.recordType,
      searchable: true,
      labels: { name: `Playwright ${scenario.id}`, namePlural: `Playwright ${scenario.id} records` },
      ...structuredClone(scenario.recordTypeOverrides),
    };
    const stageDefinition = {
      config: {
        workflow: { stage: names.workflowStage, stageLabel: 'Draft' },
        authorization: { viewRoles: ['Admin'], editRoles: ['Admin'] },
        form: names.formName,
      },
      starting: true,
      ...structuredClone(scenario.workflowOverrides),
    };

    if (recordDefinition.packageType !== names.recordType) {
      throw new Error(`Scenario '${scenario.id}' overrides its generated record type name.`);
    }
    recordtype[names.recordType] = recordDefinition;
    const stages: WorkflowConfig[string] = { [names.workflowStage]: stageDefinition };
    if (scenario.id === 'lifecycle-save-transition') {
      const submittedForm = { ...scenario.form(names), name: `${names.formName}-submitted` };
      submittedForm.componentDefinitions = submittedForm.componentDefinitions.filter(field => field.name !== 'submit');
      submittedForm.componentDefinitions.unshift({ name: 'submittedStatus', component: { class: 'ContentComponent', config: { content: 'Submitted record', contentIsTranslationCode: false } } });
      forms[submittedForm.name] = submittedForm;
      stages.submitted = {
        config: {
          workflow: { stage: 'submitted', stageLabel: 'Submitted' },
          authorization: { viewRoles: ['Admin'], editRoles: ['Admin'] },
          form: submittedForm.name,
        },
      };
    }
    if (scenario.id === 'lifecycle-server-writeback') {
      for (const mode of ['always', 'never', 'preserveLocalEdits'] as const) {
        const modeForm = { ...scenario.form(names), name: `${names.formName}-${mode}`, serverSyncOnSave: mode };
        modeForm.componentDefinitions = modeForm.componentDefinitions.filter(field => !field.name?.startsWith('mode-'));
        forms[modeForm.name] = modeForm;
        stages[mode] = { config: { workflow: { stage: mode, stageLabel: mode }, authorization: { viewRoles: ['Admin'], editRoles: ['Admin'] }, form: modeForm.name } };
      }
    }
    workflow[names.recordType] = stages;
    forms[names.formName] = form;
  }

  for (const [recordType, stages] of Object.entries(workflow)) {
    if (Object.values(stages).filter(stage => stage.starting).length !== 1) {
      throw new Error(`Scenario '${recordType}' must have exactly one starting workflow stage.`);
    }
    for (const [stageName, stage] of Object.entries(stages)) {
      const formName = stage.config?.form;
      if (!formName || !forms[formName] || forms[formName].type !== recordType) {
        throw new Error(`Scenario '${recordType}/${stageName}' has a broken form reference '${formName}'.`);
      }
    }
  }
  return { recordtype, workflow, forms };
}
