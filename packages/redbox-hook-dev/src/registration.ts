import { dashboardtype } from './config/dashboardtype';
import { dashboardview } from './config/dashboardview';
import { workspacetype } from './config/workspacetype';
import { brandingConfigurationDefaults } from './config/brandingConfigurationDefaults';
import { auth } from './config/auth';
import { record } from './config/record';
import { routes } from './config/routes';
import { views } from './config/views';
import { jsonld } from './config/jsonld';
import type { FormConfigFrame } from '@researchdatabox/sails-ng-common';
import { getPlaywrightRegistration } from './playwright/registration';

/** The host consumes these demo/scenario declarations; neither path writes data. */
export function getDevelopmentRegistration(env: NodeJS.ProcessEnv = process.env) {
  const scenario = getPlaywrightRegistration(env);
  return {
    config: {
      recordtype: scenario.recordtype,
      workflow: scenario.workflow,
      ...(scenario.csp ? { csp: scenario.csp } : {}),
      dashboardtype,
      dashboardview,
      workspacetype,
      brandingConfigurationDefaults,
      auth,
      record,
      routes,
      views,
      jsonld,
    },
    forms: scenario.forms as Record<string, FormConfigFrame>,
  };
}
