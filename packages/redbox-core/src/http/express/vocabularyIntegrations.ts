import type { Router, RequestHandler } from 'express';
import type { PoliciesConfig } from '../../config/policies.config';
import type { createHttpCsrf } from './csrf';
import { bindHttpPolicies, resolveEffectivePolicies } from './policies';
import { httpAction } from './middleware';
import { readAction } from './readActions';
import type { ReferenceRequest } from '../actions/reference';
import * as actions from '../actions/vocabularyIntegrations';
import { vocabularyIntegrationRoutes } from '../integrationRoutes';
export { vocabularyIntegrationRoutes } from '../integrationRoutes';
export interface VocabularyIntegrationHttpInput extends actions.VocabularyIntegrationInput {
  readonly csrf: Pick<ReturnType<typeof createHttpCsrf>, 'protect' | 'apiProtect'>;
  readonly policies: Readonly<Record<string, RequestHandler>>;
  readonly policyConfiguration: PoliciesConfig;
}
export function mountVocabularyIntegrationRoutes(router: Router, input: VocabularyIntegrationHttpInput): void {
  for (const route of vocabularyIntegrationRoutes) {
    const operations = {
      import: (facts: ReferenceRequest) =>
        actions.importVocabulary(input, facts, route, route.controller === 'VocabularyController'),
      sync: (facts: ReferenceRequest) => actions.sync(input, facts, route, route.controller === 'VocabularyController'),
    };
    const action = Object.hasOwn(operations, route.action)
      ? operations[route.action as keyof typeof operations]
      : undefined;
    if (!action) throw new Error('Missing declared integration action: ' + route.action);
    router[route.method](
      route.path,
      ...bindHttpPolicies(resolveEffectivePolicies(route, input.policyConfiguration), input.policies),
      ...(route.method === 'get' ? [] : [route.path.includes('/api/') ? input.csrf.apiProtect : input.csrf.protect]),
      httpAction((req, res) =>
        readAction(
          req,
          res,
          {},
          facts => action(facts),
          facts => actions.vocabularyIntegrationFailure(input, facts)
        )
      )
    );
  }
}
