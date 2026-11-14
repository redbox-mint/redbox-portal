import type { Router, RequestHandler, Request, Response } from 'express';
import { pipeline } from 'node:stream/promises';
import type { PoliciesConfig } from '../../config/policies.config';
import { bindHttpPolicies, resolveEffectivePolicies, requestContext } from './policies';
import { httpAction } from './middleware';
import { sendApiErrors } from './responses';
import { datastreamReadRoutes } from '../datastreamRoutes';
import { executeDatastreamRead, type DatastreamReadInput } from '../actions/datastreamReads';
export { datastreamReadRoutes } from '../datastreamRoutes';

export function mountDatastreamReadRoutes(
  router: Router,
  input: DatastreamReadInput & {
    readonly policies: Readonly<Record<string, RequestHandler>>;
    readonly policyConfiguration: PoliciesConfig;
    notFound?(req: Request, res: Response): Promise<void>;
  }
): void {
  for (const route of datastreamReadRoutes)
    router.get(
      route.path.endsWith('datastream*') ? route.path.replace('datastream*', 'datastream{*tail}') : route.path,
      ...bindHttpPolicies(resolveEffectivePolicies(route, input.policyConfiguration), input.policies),
      httpAction(async (req, res, next) => {
        if ('headBehavior' in route && route.headBehavior === 'fallthrough' && req.method === 'HEAD') {
          next();
          return;
        }
        let pending: NodeJS.ReadableStream | undefined;
        try {
          const result = await executeDatastreamRead(
            input,
            {
              method: req.method,
              params: req.params,
              query: req.query,
              headers: req.headers,
              context: requestContext(req),
            },
            route.action,
            route.controller === 'RecordController',
            !!input.notFound
          );
          if (result.kind === 'missing-attachment') {
            await input.notFound!(req, res);
            return;
          }
          pending = result.kind === 'stream' ? result.body : undefined;
          if (res.destroyed) return;
          // Downloads retain any status selected by upstream middleware, as in
          // the retained Express adapter. JSON results own their explicit status.
          if (result.kind === 'json') res.status(result.status);
          res.set(result.headers);
          if (result.kind === 'stream') {
            const completion = pipeline(result.body, res);
            pending = undefined;
            await completion;
          } else if (result.kind === 'bytes') res.end(result.body);
          else res.type('application/json').send(result.json);
        } catch {
          input.log.error('Datastream read failed');
          if (!res.headersSent && !res.destroyed) {
            sendApiErrors(req, res, 500, [{ detail: 'Failed to load attachments' }]);
          }
        } finally {
          if (pending) {
            if ('destroy' in pending && typeof pending.destroy === 'function') pending.destroy();
            else pending.resume();
          }
        }
      })
    );
}
