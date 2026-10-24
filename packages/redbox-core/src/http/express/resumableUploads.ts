import checkDiskSpace from 'check-disk-space';
import { AsyncLocalStorage } from 'node:async_hooks';
import type { Request, Response, Router, RequestHandler } from 'express';
import { Server as TusServer } from '@tus/server';
import type { Services as Disks } from '../../storage/StorageManager';
import { TusStorageManagerDataStore } from '../../storage/TusStorageManagerDataStore';
import type { RecordsService } from '../../RecordsService';
import type { ILogger } from '@researchdatabox/sails-ng-common';
import type { PoliciesConfig } from '../../config/policies.config';
import { BrandingModel } from '../../model/storage/BrandingModel';
import { bindHttpPolicies, resolveEffectivePolicies, requestContext } from './policies';
import { httpAction } from './middleware';
import type { createHttpCsrf } from './csrf';
import type { AuthenticatedActor } from './identity';
import { sendApiErrors } from './responses';

export const resumableUploadRoutes = ['', '/:attachId'].flatMap(suffix =>
  [false, true].map(companion => ({
    method: 'all' as const,
    path: `/:branding/:portal/${companion ? 'companion/' : ''}record/:oid/attach${suffix}`,
    controller: 'RecordController',
    action: 'doAttachment',
  }))
);
interface UploadContext {
  actor: AuthenticatedActor;
  brandId: string;
  oid: string;
  prefix: string;
}
export interface ResumableUploadsInput {
  disk: Disks.IDisk;
  records: Pick<RecordsService, 'getMeta' | 'hasEditAccess'>;
  maxSize: number;
  stagingFilesystem?: { root: string; reserveBytes: number };
  origins: readonly string[];
  rootContext?: string;
  log: ILogger;
  authorizePending(context: ReturnType<typeof requestContext>): Promise<boolean>;
  audit(
    actor: AuthenticatedActor,
    action: string,
    context: { brandId: string; oid: string; uploadId: string }
  ): Promise<unknown>;
}
/** One tus server and datastore per application. Resume state and ownership live on the selected disk. */
export class ResumableUploads {
  private readonly context = new AsyncLocalStorage<UploadContext>();
  private readonly pending = new Set<Promise<unknown>>();
  private readonly datastore: TusStorageManagerDataStore;
  private readonly tus: TusServer;
  private closing = false;
  constructor(private readonly input: ResumableUploadsInput) {
    this.datastore = new TusStorageManagerDataStore({
      disk: input.disk,
      logger: input.log,
      maxChunkBytes: 32 * 1024 * 1024,
    });
    const current = () => {
      const value = this.context.getStore();
      if (!value) throw new Error('Missing upload context');
      return value;
    };
    this.tus = new TusServer({
      path: '/attach',
      datastore: this.datastore,
      maxSize: input.maxSize,
      allowedOrigins: [...input.origins],
      respectForwardedHeaders: false,
      disableTerminationForFinishedUploads: true,
      generateUrl: (_req, { id }) => `${current().prefix}/attach/${id}`,
      onUploadCreate: async (_req, upload) => {
        const ctx = current();
        return {
          metadata: { ...upload.metadata, redboxActor: ctx.actor.id, redboxBrand: ctx.brandId, redboxRecord: ctx.oid },
        };
      },
      onIncomingRequest: async (req, id) => {
        if (req.method === 'POST' || !id) return;
        const ctx = current(),
          upload = await this.datastore.getUpload(id);
        if (
          upload.metadata?.redboxActor !== ctx.actor.id ||
          upload.metadata?.redboxBrand !== ctx.brandId ||
          upload.metadata?.redboxRecord !== ctx.oid
        )
          throw { status_code: 403, body: 'Access Denied' };
      },
      onUploadFinish: async (_req, upload) => {
        const ctx = current();
        await input.audit(ctx.actor, 'attachment-upload-completed', {
          brandId: ctx.brandId,
          oid: ctx.oid,
          uploadId: upload.id,
        });
        return {};
      },
      onResponseError: (_req, error) => {
        const code = 'status_code' in error ? error.status_code : 500;
        return {
          status_code: code,
          body:
            code === 403
              ? 'Access Denied'
              : code < 500
                ? 'Invalid upload request'
                : 'Upload operation failed; inspect resume state before retrying.',
        };
      },
    });
  }
  handle(req: Request, res: Response): Promise<void> {
    if (this.closing) {
      res.status(503).end();
      return Promise.resolve();
    }
    const work = this.handleAccepted(req, res);
    this.pending.add(work);
    void work.then(
      () => this.pending.delete(work),
      () => this.pending.delete(work)
    );
    return work;
  }
  private async handleAccepted(req: Request, res: Response): Promise<void> {
    const facts = requestContext(req),
      { actor, brand } = facts;
    if (!actor) {
      sendApiErrors(req, res, 401, [{ detail: 'Authentication required' }]);
      return;
    }
    if (!actor.roles.some(role => role.brandId === brand.id)) {
      sendApiErrors(req, res, 403, [{ detail: 'Access Denied' }]);
      return;
    }
    const oid = String(req.params.oid),
      id = req.params.attachId;
    if (id !== undefined && !/^[a-f0-9]{32}$/.test(String(id))) {
      sendApiErrors(req, res, 400, [{ detail: 'Invalid upload identifier' }]);
      return;
    }
    if (oid === 'pending-oid') {
      if (!(await this.input.authorizePending(facts))) {
        sendApiErrors(req, res, 403, [{ detail: 'Access Denied' }]);
        return;
      }
    } else {
      const record = await this.input.records.getMeta(oid);
      if (!record || record.metaMetadata?.brandId !== brand.id) {
        sendApiErrors(req, res, 404, [{ detail: 'Record not found' }]);
        return;
      }
      const roles = actor.roles.map(role => ({ ...role, branding: { id: role.brandId } }));
      if (
        !this.input.records.hasEditAccess(Object.assign(new BrandingModel(), brand), { ...actor, roles }, roles, record)
      ) {
        sendApiErrors(req, res, 403, [{ detail: 'Access Denied' }]);
        return;
      }
    }
    const length = req.headers['upload-length'];
    if (this.input.stagingFilesystem && length !== undefined && typeof length === 'string' && /^\d+$/.test(length)) {
      const { root, reserveBytes } = this.input.stagingFilesystem;
      const { free } = await checkDiskSpace(root);
      if (free <= Number(length) + reserveBytes) {
        sendApiErrors(req, res, 500, [{ detail: 'not-enough-disk-space' }]);
        return;
      }
    }
    const prefix =
      (this.input.rootContext ? '/' + this.input.rootContext.replace(/^\/+|\/+$/g, '') : '') +
      req.path.replace(/\/attach(?:\/[^/]+)?\/?$/, '');
    const original = req.url;
    req.url = '/attach' + (id ? '/' + encodeURIComponent(String(id)) : '');
    try {
      await this.context.run({ actor, brandId: brand.id, oid, prefix }, async () => {
        await this.tus.handle(req, res);
        if (['POST', 'PATCH', 'DELETE'].includes(req.method) && res.statusCode < 400)
          await this.input.audit(actor, 'attachment-upload-' + req.method.toLowerCase(), {
            brandId: brand.id,
            oid,
            uploadId: String(id ?? 'created'),
          });
      });
    } finally {
      req.url = original;
    }
  }
  quiesce(): void {
    this.closing = true;
  }
  async drain(): Promise<void> {
    while (this.pending.size) await Promise.allSettled(this.pending);
  }
  async close(): Promise<void> {
    this.quiesce();
    await this.drain();
  }
}
export function mountResumableUploadRoutes(
  router: Router,
  input: {
    uploads: Pick<ResumableUploads, 'handle'>;
    csrf: Pick<ReturnType<typeof createHttpCsrf>, 'apiProtect'>;
    policies: Readonly<Record<string, RequestHandler>>;
    policyConfiguration: PoliciesConfig;
  }
): void {
  const bindings = resumableUploadRoutes.map(route => ({
    route,
    policies: bindHttpPolicies(resolveEffectivePolicies(route, input.policyConfiguration), input.policies),
  }));
  for (const { route, policies } of bindings)
    router.all(
      route.path,
      ...policies,
      input.csrf.apiProtect,
      httpAction(async (req, res) => {
        await input.uploads.handle(req, res);
      })
    );
}
