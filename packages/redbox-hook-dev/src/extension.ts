import type { RedboxExtension } from '@researchdatabox/redbox-core/extensions';
import { getDevelopmentRegistration } from './registration';
import { convertBuiltinRecordTypeHooks } from '@researchdatabox/redbox-core/record-types';

export function registerRedboxExtension(): RedboxExtension {
  const { config, forms } = getDevelopmentRegistration();
  // Convert the two data-only host settings deliberately. The comparison
  // registration retains its original Sails spelling.
  const { routes, views, ...domains } = config;
  const landingPath: unknown = Reflect.get(routes, '/');
  if (typeof landingPath !== 'string' || !/^\/(?!\/)/.test(landingPath))
    throw new Error('Development extension requires a local landing path.');
  return {
    apiVersion: 1,
    config: {
      ...domains,
      recordtype: convertBuiltinRecordTypeHooks(domains.recordtype),
      page: { landingPath, noCache: views.noCache ?? [] },
    },
    forms,
    workflows: config.workflow as Readonly<Record<string, unknown>>,
  };
}
