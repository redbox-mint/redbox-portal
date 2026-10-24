import type { PoliciesConfig, ControllerPolicies } from '../../config/policies.config';
import { pageRoutes } from '../../http/express/pages';
import { pilotPolicyChain } from '../../http/express/policies';

/** Transport helpers now live in adapters. These chains preserve authentication and path authorization. */
export function portalHttpPolicies(): PoliciesConfig {
  const config: PoliciesConfig = { '*': [...pilotPolicyChain] };
  // Page adapters themselves add current browser authentication, brand membership,
  // path authorization and CSRF. Their public login/home routes remain public.
  for (const route of pageRoutes) {
    const controller = (config[route.controller] ?? {}) as ControllerPolicies;
    controller[route.action] = true;
    config[route.controller] = controller;
  }
  config.DynamicAssetController = { '*': true };
  config.BrandingController = { '*': true, createPreview: [...pilotPolicyChain] };
  config.TranslationController = {
    getNamespace: ['noCache', 'brandingAndPortal', 'browserActor', 'checkAuth'],
  };
  config['webservice/RecordSchemaController'] = {
    '*': [...pilotPolicyChain].map(name => (name === 'checkAuth' ? 'checkRecordSchemaAuth' : name)),
  };
  return config;
}
