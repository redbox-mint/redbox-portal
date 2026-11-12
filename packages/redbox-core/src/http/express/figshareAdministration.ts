import type { Router, RequestHandler } from 'express';
import type { PoliciesConfig } from '../../config/policies.config';
import type { createHttpCsrf } from './csrf';
import { bindHttpPolicies, resolveEffectivePolicies } from './policies';
import { httpAction } from './middleware';
import { readAction } from './readActions';
import type { ReferenceRequest } from '../actions/reference';
import * as actions from '../actions/figshareAdministration';
import { figshareAdministrationRoutes } from '../integrationRoutes';
export { figshareAdministrationRoutes } from '../integrationRoutes';
export interface FigshareAdministrationHttpInput extends actions.FigshareAdministrationInput {
  readonly csrf: Pick<ReturnType<typeof createHttpCsrf>, 'apiProtect'>;
  readonly policies: Readonly<Record<string, RequestHandler>>;
  readonly policyConfiguration: PoliciesConfig;
}
export function mountFigshareAdministrationRoutes(router: Router, input: FigshareAdministrationHttpInput): void {
  const bindings = figshareAdministrationRoutes.map(route => ({
    route,
    policies: bindHttpPolicies(resolveEffectivePolicies(route, input.policyConfiguration), input.policies),
  }));
  for (const { route, policies } of bindings) {
    const operations = {
      list: (facts: ReferenceRequest) => actions.list(input, facts, route),
      create: (facts: ReferenceRequest) => actions.create(input, facts, route),
      usage: (facts: ReferenceRequest) => actions.usage(input, facts, route),
      listLocalEntries: (facts: ReferenceRequest) => actions.listLocalEntries(input, facts, route),
      listMappings: (facts: ReferenceRequest) => actions.listMappings(input, facts, route),
      saveMappings: (facts: ReferenceRequest) => actions.saveMappings(input, facts, route),
      approve: (facts: ReferenceRequest) => actions.approve(input, facts, route),
      get: (facts: ReferenceRequest) => actions.get(input, facts, route),
      delete: (facts: ReferenceRequest) => actions.deleteCrosswalk(input, facts, route),
      listCatalogues: (facts: ReferenceRequest) => actions.listCatalogues(input, facts, route),
      listSources: (facts: ReferenceRequest) => actions.listSources(input, facts, route),
      getSource: (facts: ReferenceRequest) => actions.getSource(input, facts, route),
      listSourceCategories: (facts: ReferenceRequest) => actions.listSourceCategories(input, facts, route),
      createSourcePreview: (facts: ReferenceRequest) => actions.createSourcePreview(input, facts, route),
      cloneSource: (facts: ReferenceRequest) => actions.cloneSource(input, facts, route),
      listSyncRuns: (facts: ReferenceRequest) => actions.listSyncRuns(input, facts, route),
      createPreview: (facts: ReferenceRequest) => actions.createPreview(input, facts, route),
      getPreview: (facts: ReferenceRequest) => actions.getPreview(input, facts, route),
      applyPreview: (facts: ReferenceRequest) => actions.applyPreview(input, facts, route),
    };
    const action = Object.hasOwn(operations, route.action)
      ? operations[route.action as keyof typeof operations]
      : undefined;
    if (!action) throw new Error('Missing declared integration action: ' + route.action);
    router[route.method](
      route.path,
      ...policies,
      ...(route.method === 'get' ? [] : [input.csrf.apiProtect]),
      httpAction((req, res) =>
        readAction(
          req,
          res,
          {},
          facts => action(facts),
          (facts, error) => actions.figshareAdministrationFailure(input, facts, error)
        )
      )
    );
  }
}
