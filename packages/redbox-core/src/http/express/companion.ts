import type { Request, Router, RequestHandler } from 'express';
import { CompanionUploads } from '../integrations/companion/uploads';
export { CompanionUploads, type CompanionInput } from '../integrations/companion/uploads';
import { bindHttpPolicies, pilotPolicyChain, requestContext, resolveEffectivePolicies } from './policies';
import type { PoliciesConfig } from '../../config/policies.config';
import type { createHttpCsrf } from './csrf';
import { httpAction, httpBodyParser } from './middleware';
import type { AuthenticatedActor } from './identity';
import { companionRequestPrelude, companionDispatch } from '../integrations/companion/actions';

/** Preserve the unbranded provider URL using trusted session/deployment brand selection. */
export function mountCompanionRoutes(
  router: Router,
  input: {
    uploads: CompanionUploads;
    path: string;
    /** Canonical browser destination supplied by the application, never request headers. */
    appUrl?: string;
    context(req: Request): { branding: string; portal: string } | undefined;
    policies: Readonly<Record<string, RequestHandler>>;
    policyConfiguration: PoliciesConfig;
    csrf: Pick<ReturnType<typeof createHttpCsrf>, 'apiProtect'>;
    audit(actor: AuthenticatedActor, action: string, context: { brandId: string; method: string }): Promise<unknown>;
  }
): void {
  const policies = bindHttpPolicies(
    [
      ...pilotPolicyChain.map(name => name.toLowerCase()),
      ...resolveEffectivePolicies({ controller: 'CompanionController', action: 'handle' }, input.policyConfiguration),
    ],
    input.policies
  );
  router.all(
    [input.path, input.path + '/{*companionPath}'],
    (req, res, next) => {
      const context = input.context(req);
      if (!context) {
        res.status(403).end();
        return;
      }
      Object.assign(req.params, context);
      next();
    },
    httpBodyParser(undefined, false),
    ...policies,
    (req, res, next) => {
      if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) next();
      else input.csrf.apiProtect(req, res, next);
    },
    httpAction(async (req, res, next) => {
      if (!companionRequestPrelude(req, res, input.path)) return;
      const popup = await companionDispatch(req, {
        ...input,
        appUrl: input.appUrl,
        context: () => requestContext(req),
      });
      if (popup) {
        res.set(popup.headers).type('html').send(popup.html);
        return;
      }
      input.uploads.handle(req, res, next);
    })
  );
}
