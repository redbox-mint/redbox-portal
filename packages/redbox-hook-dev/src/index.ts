import '@researchdatabox/redbox-core';
import { defineRedboxHook, HookRegistrationMap } from '@researchdatabox/redbox-core';
import type { FormConfigFrame } from '@researchdatabox/sails-ng-common';
import { recordtype } from './config/recordtype';
import { workflow } from './config/workflow';
import { dashboardtype } from './config/dashboardtype';
import { dashboardview } from './config/dashboardview';
import { workspacetype } from './config/workspacetype';
import { brandingConfigurationDefaults } from './config/brandingConfigurationDefaults';
import { auth } from './config/auth';
import { record } from './config/record';
import { routes } from './config/routes';
import { views } from './config/views';
import { jsonld } from './config/jsonld';
import { FormConfigExports } from './form-config';

export {};

/**
 * redbox-hook-dev
 *
 * Development-only ReDBox hook that supplies the demo record types, workflows,
 * dashboards, workspace types and forms that historically shipped inside
 * @researchdatabox/redbox-core. Keeping them here lets the core stay pristine
 * (no opinionated record/form config) while the core repo's own development and
 * test environments still have a working demo dataset.
 *
 * This package is a devDependency only - it is excluded from client and
 * published production images.
 */
const hook = defineRedboxHook({
  registerRedboxConfig(): HookRegistrationMap {
    return {
      recordtype,
      workflow,
      dashboardtype,
      dashboardview,
      workspacetype,
      brandingConfigurationDefaults,
      auth,
      record,
      routes,
      views,
      jsonld,
    };
  },
  registerRedboxFormConfigs(): Record<string, FormConfigFrame> {
    return FormConfigExports;
  },
  additionalExports: {
    FormConfigExports,
  },
});

module.exports = hook;
