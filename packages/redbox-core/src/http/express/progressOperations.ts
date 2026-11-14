import { executeProgressGrant } from '../actions/progressGrant';
import type { Router, RequestHandler } from 'express';
import type { ILogger } from '@researchdatabox/sails-ng-common';
import type { Services as Progress } from '../../progress/Asynchs';
import type { RecordsService } from '../../RecordsService';
import type { PoliciesConfig } from '../../config/policies.config';
import type { createHttpCsrf } from './csrf';
import { bindHttpPolicies, resolveEffectivePolicies, requestContext } from './policies';
import { httpAction } from './middleware';
import type { ProgressSockets } from './progressSockets';
export { progressOperationRoutes, progressSocketGrantRoute } from '../progressRoutes';
import { progressOperationRoutes, progressSocketGrantRoute } from '../progressRoutes';
import { executeProgressOperation } from '../actions/progressOperations';
export function mountProgressOperationRoutes(
  router: Router,
  input: {
    readonly progress: Pick<Progress.Asynchs, 'start' | 'update' | 'finish' | 'get'>;
    readonly records: Pick<RecordsService, 'getMeta' | 'hasViewAccess'>;
    readonly sockets: Pick<ProgressSockets, 'issue' | 'emit'>;
    audit(actor: { id: string; username: string }, action: string, context: { brandId: string }): Promise<unknown>;
    readonly csrf: Pick<ReturnType<typeof createHttpCsrf>, 'apiProtect'>;
    readonly policies: Readonly<Record<string, RequestHandler>>;
    readonly policyConfiguration: PoliciesConfig;
    readonly log: ILogger;
  }
): void {
  const bindings = [...progressOperationRoutes, progressSocketGrantRoute].map(route => ({
    route,
    policies: bindHttpPolicies(resolveEffectivePolicies(route, input.policyConfiguration), input.policies),
  }));
  for (const { route, policies } of bindings)
    router[route.method](
      route.path,
      ...policies,
      ...(route.method === 'get' ? [] : [input.csrf.apiProtect]),
      httpAction(async (req, res) => {
        if (route === progressSocketGrantRoute)
          return executeProgressGrant(
            input,
            {
              params: req.params,
              query: req.query,
              headers: req.headers,
              context: () => requestContext(req),
              sessionId: req.sessionID,
            },
            res
          );
        return executeProgressOperation(
          input,
          route.action as Parameters<typeof executeProgressOperation>[1],
          {
            params: req.params,
            query: req.query,
            body: req.body,
            headers: req.headers,
            context: () => requestContext(req),
            sessionId: req.sessionID,
          },
          res
        );
      })
    );
}
