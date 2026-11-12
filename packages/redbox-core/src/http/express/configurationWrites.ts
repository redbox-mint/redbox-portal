import type { Router, RequestHandler } from 'express';
import type { PoliciesConfig } from '../../config/policies.config';
import type { createHttpCsrf } from './csrf';
import { bindHttpPolicies, resolveEffectivePolicies } from './policies';
import { httpAction } from './middleware';
import { readAction } from './readActions';
import * as actions from '../actions/configurationWrites';
import type { ReferenceRequest, ReferenceResult } from '../actions/reference';
import type { ApiRouteDefinition } from '../../api-routes/types';
import { configurationWriteRoutes as declarations } from '../mutationRoutes';
export const configurationWriteRoutes = declarations;
export interface ConfigurationWriteHttpInput extends actions.ConfigurationWriteInput {
  readonly csrf: Pick<ReturnType<typeof createHttpCsrf>, 'protect' | 'apiProtect'>;
  readonly policies: Readonly<Record<string, RequestHandler>>;
  readonly policyConfiguration: PoliciesConfig;
}
export function mountConfigurationWriteRoutes(router: Router, input: ConfigurationWriteHttpInput): void {
  const named: Readonly<
    Record<
      string,
      (
        req: ReferenceRequest,
        contract: Pick<ApiRouteDefinition, 'request'>,
        browser: boolean
      ) => Promise<ReferenceResult>
    >
  > = {
    saveAppConfig: (req, contract, browser) => actions.saveAppConfig(input, req, contract, browser),
    resetAppConfig: (req, contract) => actions.resetAppConfig(input, req, contract),
    setEntry: (req, contract, browser) => actions.setEntry(input, req, contract, browser),
    deleteEntry: (req, contract) => actions.deleteEntry(input, req, contract),
    setBundle: (req, contract, browser) => actions.setBundle(input, req, contract, browser),
    updateBundleEnabled: (req, contract) => actions.updateBundleEnabled(input, req, contract),
    setEntryApp: (req, contract, browser) => actions.setEntry(input, req, contract, browser),
    setBundleApp: (req, contract, browser) => actions.setBundle(input, req, contract, browser),
    saveWorkflowTarget: (req, contract) => actions.saveWorkflowTarget(input, req, contract),
    saveViewTarget: (req, contract) => actions.saveViewTarget(input, req, contract),
    validateSettings: (req, contract) => actions.validateSettings(input, req, contract),
    previewCopy: (req, contract) => actions.previewCopy(input, req, contract),
    applyCopy: (req, contract) => actions.applyCopy(input, req, contract),
    retiredOperation: async () => actions.retiredOperation(),
  };
  for (const route of configurationWriteRoutes) {
    const browser = !route.path.includes('/api/');
    const action = Object.hasOwn(named, route.action) ? named[route.action] : undefined;
    if (!action) throw new Error('Unbound mutation action ' + route.action);
    router[route.method](
      route.path.replace(':key*', '*key'),
      ...bindHttpPolicies(resolveEffectivePolicies(route, input.policyConfiguration), input.policies),
      browser ? input.csrf.protect : input.csrf.apiProtect,
      httpAction((req, res) =>
        readAction(
          req,
          res,
          {},
          facts => action(facts, { request: 'request' in route ? route.request : undefined }, browser),
          (facts, error) =>
            actions.configurationWriteFailure(
              facts,
              error,
              route.path.includes('/dashboard-config/'),
              browser,
              route.action,
              route.controller === 'TranslationController'
            )
        )
      )
    );
  }
}
