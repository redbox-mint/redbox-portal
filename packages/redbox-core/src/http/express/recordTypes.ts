import type { RequestHandler, Router } from 'express';
import type { PoliciesConfig } from '../../config/policies.config';
import { bindHttpPolicies, resolveEffectivePolicies } from './policies';
import { httpAction } from './middleware';
import { referenceRead } from './referenceReads';
import type { ApiRouteDefinition } from '../../api-routes/types';
import { recordTypeApiRoutes } from '../../api-routes/groups/recordtypes';
import * as actions from '../actions/recordTypeReads';
export interface RecordTypeHttpInput extends actions.RecordTypeReadInput {
  readonly policyConfiguration: PoliciesConfig;
  readonly policies: Readonly<Record<string, RequestHandler>>;
  readonly routes?: readonly ApiRouteDefinition[];
}
export function mountRecordTypeRoutes(router: Router, input: RecordTypeHttpInput): void {
  const routes = input.routes ?? recordTypeApiRoutes;
  if (
    routes.length !== recordTypeApiRoutes.length ||
    recordTypeApiRoutes.some(
      expected =>
        routes.filter(
          route =>
            route.method === expected.method &&
            route.path === expected.path &&
            route.controller === expected.controller &&
            route.action === expected.action
        ).length !== 1
    )
  )
    throw new Error('Record-type HTTP composition requires both supported contracts and dispatch targets.');
  const operations = new Map([
    ['getRecordType', actions.getRecordType],
    ['listRecordTypes', actions.listRecordTypes],
  ]);
  for (const route of routes) {
    const action = operations.get(route.action);
    if (!action) throw new Error('Unbound record-type action');
    router.get(
      route.path,
      ...bindHttpPolicies(resolveEffectivePolicies(route, input.policyConfiguration), input.policies),
      httpAction((req, res) => referenceRead(req, res, route, (facts, valid) => action(input, facts, valid)))
    );
  }
}
