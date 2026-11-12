import type { Router, RequestHandler } from 'express';
import type { PoliciesConfig } from '../../config/policies.config';
import type { createHttpCsrf } from './csrf';
import { bindHttpPolicies, resolveEffectivePolicies } from './policies';
import { httpAction } from './middleware';
import { readAction } from './readActions';
import type { ReferenceRequest } from '../actions/reference';
import * as actions from '../actions/formVocabulary';
import { formVocabularyRoutes } from '../integrationRoutes';
export { formVocabularyRoutes } from '../integrationRoutes';
export interface FormVocabularyHttpInput extends actions.FormVocabularyInput {
  readonly csrf: Pick<ReturnType<typeof createHttpCsrf>, 'protect'>;
  readonly policies: Readonly<Record<string, RequestHandler>>;
  readonly policyConfiguration: PoliciesConfig;
}
export function mountFormVocabularyRoutes(router: Router, input: FormVocabularyHttpInput): void {
  const bindings = formVocabularyRoutes.map(route => ({
    route,
    policies: bindHttpPolicies(resolveEffectivePolicies(route, input.policyConfiguration), input.policies),
  }));
  for (const { route, policies } of bindings) {
    const operations = {
      get: (facts: ReferenceRequest) => actions.get(input, facts),
      entries: (facts: ReferenceRequest) => actions.entries(input, facts),
      children: (facts: ReferenceRequest) => actions.children(input, facts),
      expandPath: (facts: ReferenceRequest) => actions.expandPath(input, facts),
      getRecords: (facts: ReferenceRequest) => actions.getRecords(input, facts),
      externalEntries: (facts: ReferenceRequest) => actions.externalEntries(input, facts),
      serviceEntries: (facts: ReferenceRequest) => actions.serviceEntries(input, facts),
      find: (facts: ReferenceRequest) => actions.find(input, facts),
    };
    const action = Object.hasOwn(operations, route.action)
      ? operations[route.action as keyof typeof operations]
      : undefined;
    if (!action) throw new Error('Missing declared integration action: ' + route.action);
    router[route.method](
      route.path,
      ...policies,
      ...(route.method === 'get' ? [] : [input.csrf.protect]),
      httpAction((req, res) =>
        readAction(
          req,
          res,
          {},
          facts => action(facts),
          (facts, error) => actions.formVocabularyFailure(input, facts, error, route.action)
        )
      )
    );
  }
}
