import type { PlaywrightScenario } from './types';
import { buildScenarioForm } from './builders';
import { lifecycleRecordType } from './scenarios/lifecycle';
import { scenarioSeedData } from './seed-data';

const definitions: ReadonlyArray<readonly [string, string]> = [
  ['initialisation-modes', 'Create, edit and view a populated form'],
  ['initialisation-dependencies', 'Render after configuration and compiled assets resolve'],
  ['expression-conditions', 'Apply matching and nonmatching expression conditions'],
  ['expression-chaining', 'Propagate chained calculated values and state'],
  ['expression-repeatables', 'Keep expression targets attached to repeatable rows'],
  ['behaviour-processors', 'Run transform and metadata behaviour processors'],
  ['behaviour-ready-enabled', 'Run enabled ready behaviours exactly once'],
  ['behaviour-debounce', 'Debounce rapid portal record lookups'],
  ['behaviour-events-errors', 'Handle emitted events and recover portal lookup errors'],
  ['behaviour-logical-row', 'Keep asynchronous results attached to logical rows'],
  ['validation-fields-cross-field', 'Validate fields and cross-field constraints'],
  ['validation-groups', 'Switch validation groups as form state changes'],
  ['validation-summaries', 'Navigate validation summaries across hidden controls'],
  ['validation-repeatables', 'Track validation errors while rows are removed'],
  ['validation-save-operations', 'Apply operation-specific save validation'],
  ['structure-tabs-accordions', 'Persist values across tabs and accordions'],
  ['structure-nested-repeatables', 'Hydrate and edit nested repeatables'],
  ['structure-question-tree', 'Retain the selected question-tree branch'],
  ['components-basic', 'Persist primitive input component values'],
  ['components-date', 'Persist a deterministic date value'],
  ['components-vocabulary', 'Search and select vocabulary values'],
  ['components-record-relations', 'Select and persist related records'],
  ['components-rich-text', 'Persist semantically formatted rich text'],
  ['components-map', 'Draw and persist supported map geometry'],
  ['components-files', 'Upload and remove a local attachment'],
  ['lifecycle-save-transition', 'Save, update and transition a record'],
  ['lifecycle-failure-navigation', 'Recover from failed saves and dirty navigation'],
  ['lifecycle-server-writeback', 'Reconcile deterministic server writeback'],
  ['lifecycle-edit-during-save', 'Preserve edits made during a save'],
  ['lifecycle-two-session-conflict', 'Resolve a stale concurrent record save'],
];

function createScenario(id: string, description: string): PlaywrightScenario {
  return {
    id,
    description,
    form: names => buildScenarioForm(names, id),
    initialMetadata: scenarioSeedData(id),
    ...(id.startsWith('lifecycle-') ? { recordTypeOverrides: lifecycleRecordType(id) } : {}),
    ...(id === 'validation-save-operations' ? { recordTypeOverrides: { recordValidation: { mode: 'enforce' as const } } } : {}),
    ...(id === 'initialisation-modes' ? { recordTypeOverrides: { searchFilters: [
      { name: 'text_title', title: 'search-refine-title', type: 'exact', typeLabel: 'search-refine-contains' },
    ] } } : {}),
  };
}

export function createPlaywrightScenarios(): readonly PlaywrightScenario[] {
  return definitions.map(([id, description]) => createScenario(id, description));
}

export const playwrightScenarios: readonly PlaywrightScenario[] = createPlaywrightScenarios();

export const playwrightScenarioIds = playwrightScenarios.map(scenario => scenario.id);

export function getPlaywrightScenario(id: string): PlaywrightScenario {
  const scenario = playwrightScenarios.find(item => item.id === id);
  if (!scenario) {
    throw new Error(`Unknown Playwright scenario '${id}'.`);
  }
  return createScenario(scenario.id, scenario.description);
}
