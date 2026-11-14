import type { Router, RequestHandler } from 'express';
import type { PoliciesConfig } from '../../config/policies.config';
import type { createHttpCsrf } from './csrf';
import { bindHttpPolicies, resolveEffectivePolicies, requestContext } from './policies';
import { httpAction } from './middleware';
import { executeBrandingUpload, type BrandingUploadInput } from '../actions/brandingUploads';
import { brandingUploadRoutes } from '../uploadRoutes';
export { brandingUploadRoutes } from '../uploadRoutes';
export function mountBrandingUploadRoutes(
  router: Router,
  input: BrandingUploadInput & {
    readonly csrf: Pick<ReturnType<typeof createHttpCsrf>, 'apiProtect' | 'protect'>;
    readonly policies: Readonly<Record<string, RequestHandler>>;
    readonly policyConfiguration: PoliciesConfig;
  }
): void {
  for (const route of brandingUploadRoutes)
    router[route.method](
      route.path,
      ...bindHttpPolicies(resolveEffectivePolicies(route, input.policyConfiguration), input.policies),
      route.path.includes('/api/') ? input.csrf.apiProtect : input.csrf.protect,
      httpAction(async (req, res) =>
        executeBrandingUpload(
          input,
          { params: req.params, query: req.query, headers: req.headers, context: () => requestContext(req) },
          res,
          route,
          consume => input.multipart.receive(req, consume)
        )
      )
    );
}
