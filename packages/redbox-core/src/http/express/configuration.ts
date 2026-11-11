import type { RequestHandler, Router } from 'express';
import type { PoliciesConfig } from '../../config/policies.config';
import { bindHttpPolicies, resolveEffectivePolicies } from './policies';
import { httpAction } from './middleware';
import { referenceRead } from './referenceReads';
import { configurationReadRoutes as declarations, appConfigFormReadRoute as formDeclaration } from '../referenceRoutes';
import * as actions from '../actions/configurationReads';
export const configurationReadRoutes = declarations;
export const appConfigFormReadRoute = formDeclaration;
export interface ConfigurationReadHttpInput extends actions.ConfigurationReadInput {
  readonly policyConfiguration: PoliciesConfig;
  readonly policies: Readonly<Record<string, RequestHandler>>;
}
export function mountConfigurationReadRoutes(router: Router, input: ConfigurationReadHttpInput): void {
  router.get(
    appConfigFormReadRoute.path,
    ...bindHttpPolicies(resolveEffectivePolicies(appConfigFormReadRoute, input.policyConfiguration), input.policies),
    httpAction((req, res) => referenceRead(req, res, {}, facts => actions.getAppConfigForm(input, facts)))
  );
  const operations = new Map<
    string,
    (
      input: actions.ConfigurationReadInput,
      facts: import('../actions/reference').ReferenceRequest,
      valid: import('../../api-routes/validation').ValidatedApiRouteRequest
    ) => Promise<import('../actions/reference').ReferenceResult>
  >([
    ['getAppConfig', actions.getAppConfig],
    ['listEntries', actions.listEntries],
    ['getEntry', actions.getEntry],
    ['getBundle', actions.getBundle],
    ['listForms', actions.listForms],
    ['getForm', actions.getForm],
  ]);
  for (const route of configurationReadRoutes) {
    const action = operations.get(route.action);
    if (!action) throw new Error('Unbound reference action: ' + route.action);
    router.get(
      route.path.replace(':key*', '*key'),
      ...bindHttpPolicies(resolveEffectivePolicies(route, input.policyConfiguration), input.policies),
      httpAction(async (req, res) => {
        if (Array.isArray(req.params.key)) req.params.key = req.params.key.join('/');
        await referenceRead(req, res, 'request' in route ? route : {}, (facts, valid) => action(input, facts, valid));
      })
    );
  }
}
