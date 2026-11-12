import type { Router, RequestHandler } from 'express';
import type { PoliciesConfig } from '../../config/policies.config';
import type { createHttpCsrf } from './csrf';
import { bindHttpPolicies, resolveEffectivePolicies } from './policies';
import { httpAction } from './middleware';
import { readAction } from './readActions';
import * as actions from '../actions/recordMutations';
import type { ReferenceRequest, ReferenceResult } from '../actions/reference';
import type { ApiRouteDefinition } from '../../api-routes/types';
import { recordMutationRoutes as declarations } from '../mutationRoutes';
export const recordMutationRoutes = declarations;
import { updateRecordMetadata } from '../actions/recordMetadata';
export interface RecordMutationHttpInput extends actions.RecordMutationInput {
  readonly csrf: Pick<ReturnType<typeof createHttpCsrf>, 'protect' | 'apiProtect'>;
  readonly policies: Readonly<Record<string, RequestHandler>>;
  readonly policyConfiguration: PoliciesConfig;
}
export function mountRecordMutationRoutes(router: Router, input: RecordMutationHttpInput): void {
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
    create: (req, contract, browser) => actions.create(input, req, contract, browser),
    updateMeta: (req, contract, browser) =>
      browser ? actions.update(input, req, contract) : updateRecordMetadata(input, req, contract),
    updateObjectMeta: (req, contract, browser) => actions.updateObjectMeta(input, req, contract, browser),
    deleteRecord: (req, contract, browser) => actions.deleteRecord(input, req, contract, browser),
    restoreRecord: (req, contract, browser) => actions.restoreRecord(input, req, contract, browser),
    destroyDeletedRecord: (req, contract, browser) => actions.destroyDeletedRecord(input, req, contract, browser),
    transitionWorkflow: (req, contract, browser) => actions.transitionWorkflow(input, req, contract, browser),
    addUserEdit: (req, contract, browser) => actions.addUserEdit(input, req, contract, browser),
    removeUserEdit: (req, contract, browser) => actions.removeUserEdit(input, req, contract, browser),
    addUserView: (req, contract, browser) => actions.addUserView(input, req, contract, browser),
    removeUserView: (req, contract, browser) => actions.removeUserView(input, req, contract, browser),
    addRoleEdit: (req, contract, browser) => actions.addRoleEdit(input, req, contract, browser),
    removeRoleEdit: (req, contract, browser) => actions.removeRoleEdit(input, req, contract, browser),
    addRoleView: (req, contract, browser) => actions.addRoleView(input, req, contract, browser),
    removeRoleView: (req, contract, browser) => actions.removeRoleView(input, req, contract, browser),
    update: (req, contract) => actions.update(input, req, contract),
    delete: (req, contract, browser) => actions.deleteRecord(input, req, contract, browser),
    stepTo: (req, contract, browser) => actions.transitionWorkflow(input, req, contract, browser),
  };
  for (const route of recordMutationRoutes) {
    const browser = route.controller === 'RecordController';
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
          (facts, error) => actions.recordMutationFailure(input, facts, error)
        )
      )
    );
  }
}
