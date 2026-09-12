/** Pure catalogue exports. This module does not initialise Sails or load the
 * hook runtime entrypoint, so listing scenarios is safe in scripts and CI. */
export {
  playwrightScenarios,
  playwrightScenarioIds,
  getPlaywrightScenario,
  createPlaywrightScenarios,
} from './catalogue';
export { namesForScenario, buildScenarioForm, buildScenarioRegistration } from './builders';
export { getPlaywrightRegistration, getPlaywrightForms, playwrightScenariosEnabled } from './registration';
export type { PlaywrightScenario, ScenarioNames, ScenarioRegistration } from './types';
export { initialisationForm } from './scenarios/initialisation';
export { expressionForm } from './scenarios/expressions';
export { behaviourForm } from './scenarios/behaviours';
export { validationForm } from './scenarios/validation';
export { structureForm } from './scenarios/structure';
export { primitiveForm } from './scenarios/primitives';
export { integrationComponentForm } from './scenarios/components';
export { lifecycleForm, lifecycleRecordType } from './scenarios/lifecycle';
