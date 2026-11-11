import type { RequestHandler, Router } from 'express';
import type { PoliciesConfig } from '../../config/policies.config';
import { bindHttpPolicies, resolveEffectivePolicies } from './policies';
import { httpAction } from './middleware';
import { referenceRead } from './referenceReads';
import { formDeliveryRoutes as declarations } from '../referenceRoutes';
import * as actions from '../actions/formDelivery';
export const formDeliveryRoutes = declarations;
export interface FormDeliveryHttpInput extends actions.FormDeliveryInput {
  readonly policyConfiguration: PoliciesConfig;
  readonly policies: Readonly<Record<string, RequestHandler>>;
}
export function mountFormDeliveryRoutes(router: Router, input: FormDeliveryHttpInput): void {
  for (const route of formDeliveryRoutes) {
    router.get(
      route.path.replace(':key*', '*key'),
      ...bindHttpPolicies(resolveEffectivePolicies(route, input.policyConfiguration), input.policies),
      httpAction(async (req, res) => {
        await referenceRead(req, res, {}, (facts, valid) => actions.getForm(input, facts));
      })
    );
  }
}
