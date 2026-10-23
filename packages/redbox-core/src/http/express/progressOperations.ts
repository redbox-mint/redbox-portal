import type { Router, RequestHandler } from 'express';
import type { ILogger } from '@researchdatabox/sails-ng-common';
import type { Services as Progress } from '../../progress/Asynchs';
import type { RecordsService } from '../../RecordsService';
import { authorizeProgressRoom } from '../../progress/authorization';
import type { PoliciesConfig } from '../../config/policies.config';
import type { createHttpCsrf } from './csrf';
import { bindHttpPolicies, resolveEffectivePolicies, requestContext } from './policies';
import { httpAction, singleHttpResult } from './middleware';
import { sendApiData, sendApiErrors } from './responses';
import type { ProgressSockets } from './progressSockets';
export const progressOperationRoutes = [
  ...(['post', 'put', 'delete', 'get'] as const).map((method, index) => ({
    method,
    path: '/:branding/:portal/asynch',
    controller: 'AsynchController',
    action: ['start', 'update', 'stop', 'progress'][index]!,
  })),
  {
    method: 'get' as const,
    path: '/:branding/:portal/asynch/subscribe/:roomId',
    controller: 'AsynchController',
    action: 'subscribe',
  },
  {
    method: 'delete' as const,
    path: '/:branding/:portal/asynch/subscribe/:roomId',
    controller: 'AsynchController',
    action: 'unsubscribe',
  },
];
export const progressSocketGrantRoute = {
  method: 'post' as const,
  path: '/:branding/:portal/asynch/socket-token',
  controller: 'AsynchController',
  action: 'subscribe',
};
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
        try {
          const { actor, brand } = requestContext(req);
          if (!actor) {
            sendApiErrors(req, res, 401, [{ detail: 'Authentication required' }]);
            return;
          }
          if (!actor.roles.some(r => r.brandId === brand.id)) {
            sendApiErrors(req, res, 403, [{ detail: 'Access Denied' }]);
            return;
          }
          if (route === progressSocketGrantRoute) {
            sendApiData(req, res, {
              token: input.sockets.issue(
                {
                  sessionId: req.sessionID,
                  ...(req.headers.authorization ? { authorization: req.headers.authorization } : {}),
                },
                brand,
                actor
              ),
            });
            return;
          }
          if (route.action === 'subscribe' || route.action === 'unsubscribe') {
            sendApiErrors(req, res, 410, [
              { detail: 'Use direct Socket.IO subscribe/unsubscribe events with an owned socket grant.' },
            ]);
            return;
          }
          const body = req.body ?? {};
          if (!body || typeof body !== 'object' || Array.isArray(body)) {
            sendApiErrors(req, res, 400, [{ detail: 'Invalid progress payload' }]);
            return;
          }
          const permitted = (room: string) => authorizeProgressRoom(room, brand, actor, input);
          if (route.action === 'progress') {
            let query: unknown = req.query.fq;
            if (typeof query === 'string')
              try {
                query = JSON.parse(query);
              } catch {
                sendApiErrors(req, res, 400, [{ detail: 'Invalid progress query' }]);
                return;
              }
            if (!query || typeof query !== 'object' || Array.isArray(query)) {
              sendApiData(req, res, { status: false, message: 'Empty queries are not allowed.' });
              return;
            }
            const where = Reflect.get(query, 'where') ?? query;
            if (!where || typeof where !== 'object' || Array.isArray(where)) {
              sendApiErrors(req, res, 400, [{ detail: 'Invalid progress query' }]);
              return;
            }
            const filter: Record<string, unknown> = { branding: brand.id };
            for (const [key, value] of Object.entries(where)) {
              if (
                !['id', 'name', 'relatedRecordId', 'taskType', 'status', 'started_by'].includes(key) ||
                typeof value !== 'string'
              ) {
                sendApiErrors(req, res, 400, [{ detail: 'Invalid progress query' }]);
                return;
              }
              filter[key] = value;
            }
            const rows = await singleHttpResult(input.progress.get({ where: filter, limit: 1000 }));
            const readable = [];
            for (const row of rows.slice(0, 1000))
              if (typeof row.relatedRecordId === 'string' && (await permitted(row.relatedRecordId))) readable.push(row);
            sendApiData(req, res, readable);
            return;
          }
          const id = body.id ?? req.query.id;
          let existing: Record<string, unknown> | undefined;
          if (route.action !== 'start') {
            if (typeof id !== 'string' || !/^[a-f0-9]{24}$/.test(id)) {
              sendApiErrors(req, res, 400, [{ detail: 'Progress identifier is required' }]);
              return;
            }
            existing = (await singleHttpResult(input.progress.get({ id, branding: brand.id })))[0];
            if (
              !existing ||
              existing.started_by !== actor.username ||
              typeof existing.relatedRecordId !== 'string' ||
              !(await permitted(existing.relatedRecordId))
            ) {
              sendApiErrors(req, res, 403, [{ detail: 'Access Denied' }]);
              return;
            }
          }
          const relatedRecordId = body.relatedRecordId ?? existing?.relatedRecordId;
          if (typeof relatedRecordId !== 'string' || !(await permitted(relatedRecordId))) {
            sendApiErrors(req, res, 403, [{ detail: 'Access Denied' }]);
            return;
          }
          if (existing && relatedRecordId !== existing.relatedRecordId) {
            sendApiErrors(req, res, 400, [{ detail: 'Progress record ownership cannot change' }]);
            return;
          }
          const values: Record<string, unknown> = { branding: brand.id, started_by: actor.username, relatedRecordId };
          for (const key of ['name', 'status', 'message', 'taskType', 'metadata', 'targetIdx', 'currentIdx'])
            if (body[key] !== undefined) values[key] = body[key];
          if (
            (route.action === 'start' && (typeof values.name !== 'string' || !values.name.trim())) ||
            ['name', 'status', 'message', 'taskType'].some(
              key => values[key] !== undefined && (typeof values[key] !== 'string' || String(values[key]).length > 8192)
            ) ||
            ['targetIdx', 'currentIdx'].some(
              key => values[key] !== undefined && (!Number.isSafeInteger(values[key]) || Number(values[key]) < 0)
            )
          ) {
            sendApiErrors(req, res, 400, [{ detail: 'Invalid progress fields' }]);
            return;
          }
          const result =
            route.action === 'start'
              ? await singleHttpResult(input.progress.start(values))
              : route.action === 'stop'
                ? (await singleHttpResult(input.progress.finish(String(id))))[0]
                : (
                    await singleHttpResult(
                      input.progress.update({ id, branding: brand.id, started_by: actor.username }, values)
                    )
                  )[0];
          if (!result) throw new Error('Progress write returned no result');
          await input.sockets.emit(route.action === 'update' ? 'update' : route.action, result);
          await input.audit(actor, 'progress-' + route.action, { brandId: brand.id });
          sendApiData(req, res, result);
        } catch (_error) {
          input.log.error('Progress operation failed');
          sendApiErrors(req, res, 500, [
            { detail: 'Progress operation failed. Review current state before retrying.' },
          ]);
        }
      })
    );
}
