import type { Router, RequestHandler, Request, Response } from 'express';
import { pipeline } from 'node:stream/promises';
import type { ILogger } from '@researchdatabox/sails-ng-common';
import type { RecordsService } from '../../RecordsService';
import type { DatastreamService } from '../../DatastreamService';
import { BrandingModel } from '../../model/storage/BrandingModel';
import { listDatastreamsRoute, getDataStreamRoute } from '../../api-routes/groups/records';
import type { PoliciesConfig } from '../../config/policies.config';
import { bindHttpPolicies, resolveEffectivePolicies, requestContext } from './policies';
import { httpAction } from './middleware';
import { sendApiData, sendApiErrors } from './responses';
export const datastreamReadRoutes = [
  listDatastreamsRoute,
  getDataStreamRoute,
  ...['record', 'companion/record'].map(prefix => ({
    method: 'get' as const,
    path: '/:branding/:portal/' + prefix + '/:oid/attach/:attachId',
    controller: 'RecordController',
    action: 'doAttachment',
  })),
  {
    method: 'get' as const,
    path: '/:branding/:portal/record/:oid/attachments',
    controller: 'RecordController',
    action: 'getAttachments',
  },
  {
    method: 'get' as const,
    path: '/:branding/:portal/record/:oid/datastream*',
    controller: 'RecordController',
    action: 'getDataStream',
  },
];
export function mountDatastreamReadRoutes(
  router: Router,
  input: {
    readonly records: Pick<RecordsService, 'getMeta' | 'getAttachments' | 'hasViewAccess'>;
    readonly datastream: Pick<DatastreamService, 'getDatastream'>;
    readonly policies: Readonly<Record<string, RequestHandler>>;
    readonly policyConfiguration: PoliciesConfig;
    readonly log: ILogger;
    notFound?(req: Request, res: Response): Promise<void>;
  }
): void {
  const bindings = datastreamReadRoutes.map(route => ({
    route,
    policies: bindHttpPolicies(resolveEffectivePolicies(route, input.policyConfiguration), input.policies),
  }));
  for (const { route, policies } of bindings)
    router.get(
      route.path.endsWith('datastream*') ? route.path.replace('datastream*', 'datastream{*tail}') : route.path,
      ...policies,
      httpAction(async (req, res, next) => {
        if (route.action === 'doAttachment' && req.method === 'HEAD') {
          next();
          return;
        }
        let pendingReadstream: NodeJS.ReadableStream | undefined;
        const releasePendingStream = () => {
          const stream = pendingReadstream;
          pendingReadstream = undefined;
          if (!stream) return;
          if ('destroy' in stream && typeof stream.destroy === 'function') stream.destroy();
          else stream.resume();
        };
        try {
          const { actor, brand } = requestContext(req),
            oid = req.params.oid;
          if (typeof oid !== 'string' || !oid.trim()) {
            sendApiErrors(req, res, 400, [{ detail: 'Record oid is required.' }]);
            return;
          }
          if (!actor) {
            sendApiErrors(req, res, 401, [{ detail: 'Authentication required' }]);
            return;
          }
          const record = await input.records.getMeta(oid);
          if (!record || record.metaMetadata?.brandId !== brand.id) {
            sendApiErrors(req, res, 404, [{ detail: 'Record not found' }]);
            return;
          }
          const roles = actor.roles.map(r => ({ id: r.id, name: r.name, branding: { id: r.brandId } })),
            user = { ...actor, roles };
          if (!input.records.hasViewAccess(Object.assign(new BrandingModel(), brand), user, roles, record)) {
            sendApiErrors(req, res, 403, [{ detail: 'Access Denied' }]);
            return;
          }
          const genericDatastream = route.controller === 'RecordController' && route.action === 'getDataStream';
          // Authorize the record before validating or disclosing its stored membership.
          const id = req.params.datastreamId ?? req.params.attachId ?? req.query.datastreamId;
          if (!['getAttachments', 'listDatastreams'].includes(route.action)) {
            if (typeof id !== 'string' || !id.trim() || (req.query.fileName != null && typeof req.query.fileName !== 'string')) {
              sendApiErrors(req, res, 400, [{ detail: 'Invalid datastream identifier or filename' }]);
              return;
            }
          }
          const attachments = await input.records.getAttachments(oid, undefined, { username: actor.username });
          if (route.action === 'getAttachments') {
            sendApiData(req, res, attachments);
            return;
          }
          if (route.action === 'listDatastreams') {
            sendApiData(req, res, {
              summary: { numFound: attachments.length, page: 1, start: 0 },
              records: attachments,
            });
            return;
          }
          if (typeof id !== 'string' || !id) {
            sendApiErrors(req, res, 400, [{ detail: 'Invalid datastream identifier' }]);
            return;
          }
          const missing = async () => {
            if (route.controller === 'RecordController' && req.get('X-Source') !== 'jsclient' && input.notFound)
              await input.notFound(req, res);
            else sendApiErrors(req, res, 404, [{ detail: 'Attachment not found' }]);
          };
          const found = attachments.find(a => a.fileId === id);
          if (!found) {
            await missing();
            return;
          }
          let response: Awaited<ReturnType<DatastreamService['getDatastream']>>;
          try {
            response = await input.datastream.getDatastream(oid, id, {
              username: actor.username,
              actorId: actor.id,
              brandId: brand.id,
            });
          } catch (error) {
            if (
              error instanceof Error &&
              (error.message === 'attachment-not-found' || Reflect.get(error, 'code') === 'ENOENT')
            ) {
              await missing();
              return;
            }
            throw error;
          }
          pendingReadstream = response.readstream;
          if (res.destroyed) { releasePendingStream(); return; }
          const fileName =
            typeof req.query.fileName === 'string' && req.query.fileName
              ? req.query.fileName
              : String(genericDatastream ? id : (found?.name ?? id));
          res
            .set(
              'Content-Type',
              route.action === 'doAttachment'
                ? String(found?.mimeType ?? 'application/octet-stream')
                : 'application/octet-stream'
            )
            .attachment(fileName);
          if (found?.size !== undefined && Number.isSafeInteger(Number(found.size)) && Number(found.size) >= 0)
            res.set('Content-Length', String(found.size));
          if (response.readstream) {
            if (res.destroyed) {
              if ('destroy' in response.readstream && typeof response.readstream.destroy === 'function')
                response.readstream.destroy();
              else response.readstream.resume();
              return;
            }
            const completion = pipeline(response.readstream, res);
            pendingReadstream = undefined;
            await completion;
          } else res.end(response.body ?? '');
        } catch (_error) {
          releasePendingStream();
          input.log.error('Datastream read failed');
          if (!res.headersSent && !res.destroyed)
            sendApiErrors(req, res, 500, [{ detail: 'Failed to load attachments' }]);
        }
      })
    );
}
