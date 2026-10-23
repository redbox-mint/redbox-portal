import { safeChronicleText } from '../utilities/RequestChronicle';
import { pageCsp, type CspConfig } from '../pages/csp';
export function contentSecurityPolicy(req: Sails.Req, res: Sails.Res, next: Sails.NextFunction): void {
  sails.log.verbose(
    `Setting Content Security Policy nonce headers and view local for ${safeChronicleText(req.path, 500)}`
  );
  let analytics: { enabled?: boolean; provider?: string; trackingId?: string } | undefined;
  try {
    if (
      typeof sails.config.brandingAware === 'function' &&
      typeof BrandingService !== 'undefined' &&
      typeof BrandingService.getBrandNameFromReq === 'function'
    )
      analytics = sails.config.brandingAware(BrandingService.getBrandNameFromReq(req))?.webAnalytics;
  } catch (error) {
    sails.log.warn(`Failed to apply web analytics CSP sources: ${(error as Error)?.message}`);
  }
  const result = pageCsp({
    configuration: (sails.config.csp || (sails.config.security as { csp?: CspConfig })?.csp) as CspConfig,
    pathname: req.path,
    appUrl: String(sails.config.appUrl ?? ''),
    environment: process.env.NODE_ENV ?? '',
    analytics,
  });
  if (result) {
    res.set(result.headerName, result.headerValue);
    if (!req.options) req.options = {};
    const locals = (req.options.locals ?? {}) as Record<string, unknown>;
    req.options.locals = locals;
    locals.contentSecurityPolicyNonce = result.nonce;
  }
  next();
}
export default contentSecurityPolicy;
