import type { Router, RequestHandler } from 'express';
import type { PoliciesConfig } from '../../config/policies.config';
import type { createHttpCsrf } from './csrf';
import { bindHttpPolicies, resolveEffectivePolicies } from './policies';
import { httpAction } from './middleware';
import { readAction } from './readActions';
import type { ReferenceRequest } from '../actions/reference';
import * as actions from '../actions/brandingOperations';
import { brandingOperationRoutes } from '../integrationRoutes';
export { brandingOperationRoutes } from '../integrationRoutes';
export interface BrandingOperationsHttpInput extends actions.BrandingOperationsInput {
  readonly csrf: Pick<ReturnType<typeof createHttpCsrf>, 'protect' | 'apiProtect'>;
  readonly policies: Readonly<Record<string, RequestHandler>>;
  readonly policyConfiguration: PoliciesConfig;
}
export function mountBrandingOperationRoutes(router: Router, input: BrandingOperationsHttpInput): void {
  const bindings = brandingOperationRoutes.map(route => ({
    route,
    policies: bindHttpPolicies(resolveEffectivePolicies(route, input.policyConfiguration), input.policies),
  }));
  for (const { route, policies } of bindings) {
    const operations = {
      config: (facts: ReferenceRequest) => actions.config(input, facts, route),
      draft: (facts: ReferenceRequest) => actions.draft(input, facts, route),
      deleteFace: (facts: ReferenceRequest) => actions.deleteFace(input, facts, route),
      useDefault: (facts: ReferenceRequest) => actions.useDefault(input, facts, route),
      revert: (facts: ReferenceRequest) => actions.revert(input, facts, route),
      preview: (facts: ReferenceRequest) => actions.preview(input, facts, route),
      versions: (facts: ReferenceRequest) => actions.versions(input, facts, route),
      versionPreview: (facts: ReferenceRequest) => actions.versionPreview(input, facts, route),
      publish: (facts: ReferenceRequest) => actions.publish(input, facts, route),
      restore: (facts: ReferenceRequest) => actions.restore(input, facts, route),
      rollback: (facts: ReferenceRequest) => actions.rollback(input, facts, route),
      history: (facts: ReferenceRequest) => actions.history(input, facts, route),
      createPreview: (facts: ReferenceRequest) => actions.createPreview(input, facts, route),
    };
    const action = Object.hasOwn(operations, route.action)
      ? operations[route.action as keyof typeof operations]
      : undefined;
    if (!action) throw new Error('Missing declared integration action: ' + route.action);
    router[route.method](
      route.path,
      ...policies,
      ...(route.method === 'get' ? [] : [route.path.includes('/api/') ? input.csrf.apiProtect : input.csrf.protect]),
      httpAction((req, res) =>
        readAction(
          req,
          res,
          {},
          facts => action(facts),
          (facts, error) => actions.brandingOperationFailure(input, facts, error)
        )
      )
    );
  }
}
