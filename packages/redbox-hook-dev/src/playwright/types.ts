import type { FormConfigFrame } from '@researchdatabox/sails-ng-common';
import type { RecordTypeConfig } from '@researchdatabox/redbox-core';
import type { WorkflowConfig } from '@researchdatabox/redbox-core';

/** Names generated for one scenario. They are deliberately predictable so a
 * seeded record can be opened from a copied URL while debugging a failure. */
export interface ScenarioNames {
  recordType: string;
  formName: string;
  workflowStage: string;
}

export interface PlaywrightScenario {
  /** Stable ID used by the coverage report (without the e2e- prefix). */
  id: string;
  description: string;
  form: (names: ScenarioNames) => FormConfigFrame;
  initialMetadata?: Record<string, unknown>;
  recordTypeOverrides?: Partial<RecordTypeConfig[string]>;
  workflowOverrides?: Partial<WorkflowConfig[string][string]>;
}

export interface ScenarioRegistration {
  recordtype: RecordTypeConfig;
  workflow: WorkflowConfig;
  forms: Record<string, FormConfigFrame>;
}
