import type { Router, RequestHandler } from 'express';
import type { PoliciesConfig } from '../../config/policies.config';
import type { createHttpCsrf } from './csrf';
import { bindHttpPolicies, resolveEffectivePolicies } from './policies';
import { httpAction } from './middleware';
import { readAction } from './readActions';
import type { ReferenceRequest } from '../actions/reference';
import * as actions from '../actions/vocabularyAdministration';
import { vocabularyAdministrationRoutes } from '../integrationRoutes';
export { vocabularyAdministrationRoutes } from '../integrationRoutes';
export interface VocabularyAdministrationHttpInput extends actions.VocabularyAdministrationInput {
  readonly csrf: Pick<ReturnType<typeof createHttpCsrf>, 'protect' | 'apiProtect'>;
  readonly policies: Readonly<Record<string, RequestHandler>>;
  readonly policyConfiguration: PoliciesConfig;
}
export function mountVocabularyAdministrationRoutes(router: Router, input: VocabularyAdministrationHttpInput): void {
  const bindings = vocabularyAdministrationRoutes.map(route => ({
    route,
    policies: bindHttpPolicies(resolveEffectivePolicies(route, input.policyConfiguration), input.policies),
  }));
  for (const { route, policies } of bindings) {
    const operations = {
      list: (facts: ReferenceRequest) => actions.list(input, facts, route),
      get: (facts: ReferenceRequest) => actions.get(input, facts, route),
      create: (facts: ReferenceRequest) => actions.create(input, facts, route),
      update: (facts: ReferenceRequest) => actions.update(input, facts, route),
      reorder: (facts: ReferenceRequest) => actions.reorder(input, facts, route),
      delete: (facts: ReferenceRequest) => actions.deleteVocabulary(input, facts, route),
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
          (facts, error) =>
            actions.vocabularyAdministrationFailure(input, facts, error, route.controller === 'VocabularyController')
        )
      )
    );
  }
}
