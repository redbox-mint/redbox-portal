import { recordHttpFailure } from './middleware';
import { dashboardReadError } from '../actions/reference';
import type { RequestHandler, Router } from 'express';
import type { PoliciesConfig } from '../../config/policies.config';
import { bindHttpPolicies, resolveEffectivePolicies } from './policies';
import { httpAction } from './middleware';
import { referenceRead } from './referenceReads';
import { metadataReadRoutes as declarations } from '../referenceRoutes';
import * as actions from '../actions/metadataReads';
export const metadataReadRoutes = declarations;
export interface MetadataReadHttpInput extends actions.MetadataReadInput {
  readonly policyConfiguration: PoliciesConfig;
  readonly policies: Readonly<Record<string, RequestHandler>>;
}
export function mountMetadataReadRoutes(router: Router, input: MetadataReadHttpInput): void {
  const operations = new Map<
    string,
    (
      input: actions.MetadataReadInput,
      facts: import('../actions/reference').ReferenceRequest,
      valid: import('../../api-routes/validation').ValidatedApiRouteRequest
    ) => Promise<import('../actions/reference').ReferenceResult>
  >([
    ['getType', actions.getType],
    ['getAllTypes', actions.getAllTypes],
    ['getWorkflowSteps', actions.getWorkflowSteps],
    ['get', actions.get],
    ['getOne', actions.getOne],
    ['getAllDashboardTypes', actions.getAllDashboardTypes],
    ['getDashboardType', actions.getDashboardType],
    ['getDashboardWorkflowSettings', actions.getDashboardWorkflowSettings],
    ['getDashboardViewSettings', actions.getDashboardViewSettings],
    ['getDashboardView', actions.getDashboardView],
    ['getNamespace', actions.getNamespace],
    ['getLanguages', actions.getLanguages],
    ['listEntriesApp', actions.listEntriesApp],
    ['getBundleApp', actions.getBundleApp],
    ['listTargets', actions.listTargets],
    ['getWorkflowTarget', actions.getWorkflowTarget],
    ['getViewTarget', actions.getViewTarget],
    ['getWorkflowFields', actions.getWorkflowFields],
    ['getViewFields', actions.getViewFields],
    ['migrationPreflight', actions.migrationPreflight],
    ['retiredOperation', actions.retiredOperation],
  ]);
  for (const route of metadataReadRoutes) {
    const action = operations.get(route.action);
    if (!action) throw new Error('Unbound reference action: ' + route.action);
    router.get(
      route.path.replace(':key*', '*key'),
      ...bindHttpPolicies(resolveEffectivePolicies(route, input.policyConfiguration), input.policies),
      httpAction(async (req, res) => {
        await referenceRead(
          req,
          res,
          'request' in route ? route : {},
          (facts, valid) => action(input, facts, valid),
          (facts, error) => {
            if (route.controller === 'TranslationController') {
              const failure = new Map([
                ['getNamespace', 'translationGetNamespaceFailed'],
                ['getLanguages', 'translationGetLanguagesFailed'],
                ['listEntriesApp', 'translationListEntriesFailed'],
                ['getBundleApp', 'translationGetBundleFailed'],
              ]).get(route.action);
              recordHttpFailure(req, undefined, 'Translation read failed', failure ? { [failure]: true } : {});
            }
            return dashboardReadError(facts, error);
          }
        );
      })
    );
  }
}
