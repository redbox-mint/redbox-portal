import type { HookRegistrationMap } from '@researchdatabox/redbox-core';
import type { FormConfigFrame } from '@researchdatabox/sails-ng-common';
import { recordtype } from '../config/recordtype';
import { workflow } from '../config/workflow';
import { FormConfigExports } from '../form-config';
import { createPlaywrightScenarios } from './catalogue';
import { buildScenarioRegistration } from './builders';

import { playwrightScenariosEnabled } from './environment';
export { playwrightScenariosEnabled } from './environment';

export function getPlaywrightRegistration(env: NodeJS.ProcessEnv = process.env): HookRegistrationMap {
  if (!playwrightScenariosEnabled(env)) {
    return { recordtype, workflow, forms: FormConfigExports };
  }

  const scenarios = buildScenarioRegistration(createPlaywrightScenarios());
  return {
    recordtype: { ...recordtype, ...scenarios.recordtype },
    workflow: { ...workflow, ...scenarios.workflow },
    forms: { ...FormConfigExports, ...scenarios.forms },
    csp: { directives: { 'img-src': ["'self'", 'data:', new URL(env.PLAYWRIGHT_BROWSER_STUB_URL ?? 'http://playwright-stubs:8787').origin] } },
  };
}

export function getPlaywrightForms(env: NodeJS.ProcessEnv = process.env): Record<string, FormConfigFrame> {
  return getPlaywrightRegistration(env).forms as Record<string, FormConfigFrame>;
}
