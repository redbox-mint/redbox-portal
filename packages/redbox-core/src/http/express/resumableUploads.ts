import type { Router, RequestHandler, Request, Response } from 'express';
import type { PoliciesConfig } from '../../config/policies.config';
import { bindHttpPolicies, resolveEffectivePolicies, requestContext } from './policies';
import { httpAction } from './middleware';
import type { createHttpCsrf } from './csrf';
import { ResumableUploads as OwnedResumableUploads } from '../actions/resumableUploads';
export type { ResumableUploadsInput } from '../actions/resumableUploads';
export { resumableUploadRoutes } from '../uploadRoutes';
import { resumableUploadRoutes } from '../uploadRoutes';
/** Retained Express transport. The domain/protocol owner has no Express inputs. */
export class ResumableUploads {
  private readonly uploads: OwnedResumableUploads;
  constructor(input: import('../actions/resumableUploads').ResumableUploadsInput) {
    this.uploads = new OwnedResumableUploads(input);
  }
  quiesce() {
    this.uploads.quiesce();
  }
  drain() {
    return this.uploads.drain();
  }
  close() {
    return this.uploads.close();
  }
  handle(req: Request, res: Response): Promise<void> {
    return this.uploads.handle(
      {
        params: req.params,
        query: req.query,
        headers: req.headers,
        method: req.method,
        path: req.path,
        context: () => requestContext(req),
      },
      res,
      handle => handle(req, res)
    );
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
