import '@researchdatabox/redbox-core';
import { defineRedboxHook, HookRegistrationMap } from '@researchdatabox/redbox-core';
import type { FormConfigFrame } from '@researchdatabox/sails-ng-common';
import { FormConfigExports } from './form-config';
import { getDevelopmentRegistration } from './registration';
export * from './playwright';

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
    return getDevelopmentRegistration().config;
  },
  registerRedboxFormConfigs(): Record<string, FormConfigFrame> {
    return getDevelopmentRegistration().forms;
  },
  additionalExports: {
    FormConfigExports,
  },
});

module.exports = hook;
