import type { RedboxExtension } from '@researchdatabox/redbox-core/extensions';
import { getDevelopmentRegistration } from './registration';

export function registerRedboxExtension(): RedboxExtension {
  const { config, forms } = getDevelopmentRegistration();
  return {
    apiVersion: 1,
    config,
    forms,
    workflows: config.workflow as Readonly<Record<string, unknown>>,
  };
}
