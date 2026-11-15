import type { RedboxExtensionV2 } from '@researchdatabox/redbox-core/extensions';
import { getDevelopmentRegistration } from './registration';
import { convertBuiltinRecordTypeHooks } from '@researchdatabox/redbox-core/record-types';

export function registerRedboxExtension(): RedboxExtensionV2 {
  const { config, forms } = getDevelopmentRegistration();
  // Convert development page declarations to the host configuration contract.
  const { routes, views, ...domains } = config;
  const landingPath: unknown = Reflect.get(routes, '/');
  if (typeof landingPath !== 'string' || !/^\/(?!\/)/.test(landingPath))
    throw new Error('Development extension requires a local landing path.');
  return {
    apiVersion: 2,
    config: {
      ...domains,
      recordtype: convertBuiltinRecordTypeHooks(domains.recordtype),
      page: { landingPath, noCache: views.noCache ?? [] },
    },
    forms,
    workflows: config.workflow as Readonly<Record<string, unknown>>,
  };
}
