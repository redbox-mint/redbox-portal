import type { Router, RequestHandler } from 'express';
import type { PoliciesConfig } from '../../config/policies.config';
import * as actions from '../actions/recordSchemaReads';
import type { RecordSchemaReadInput } from '../actions/recordSchemaReads';
import { recordSchemaReadRoutes as declarations } from '../readRoutes';
import { bindHttpPolicies, resolveEffectivePolicies } from './policies';
import { httpAction } from './middleware';
import { readAction } from './readActions';
export const recordSchemaReadRoutes = declarations;
export interface RecordSchemaReadHttpInput extends RecordSchemaReadInput {
  readonly policies: Readonly<Record<string, RequestHandler>>;
  readonly policyConfiguration: PoliciesConfig;
}
export function mountRecordSchemaReadRoutes(router: Router, input: RecordSchemaReadHttpInput): void {
  for (const route of recordSchemaReadRoutes) {
    const action = actions[route.action as 'create' | 'update' | 'immutable'];
    router.get(
      route.path,
      ...bindHttpPolicies(resolveEffectivePolicies(route, input.policyConfiguration), input.policies),
      httpAction(async (req, res) => {
        await readAction(req, res, {}, facts =>
          action(input, { ...facts, path: (input.rootContext ?? '') + req.path }, route)
        );
      })
    );
  }
}
