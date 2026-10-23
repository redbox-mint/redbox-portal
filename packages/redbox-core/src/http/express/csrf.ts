import { csrfSync } from 'csrf-sync';
import type { Request, RequestHandler, Router } from 'express';
import { httpAction } from './middleware';
import { sendApiErrors } from './responses';

export const csrfTokenRoute = { method: 'get' as const, path: '/csrfToken', action: 'token' };
export interface HttpCsrfInput {
  /** Canonical browser origins from deployment configuration, never forwarded headers. */
  readonly origins: readonly string[];
  /** Only explicitly exempt REST mounts may use independently verified bearer authentication. */
  authenticateBearer?(token: string): Promise<unknown | false>;
}
export function createHttpCsrf(input: HttpCsrfInput) {
  const origins = new Set(input.origins);
  if (!origins.size || [...origins].some(value => URL.parse(value)?.origin !== value))
    throw new TypeError('CSRF requires explicit canonical browser origins.');
  const implementation = csrfSync({
    size: 32,
    ignoredMethods: [],
    getTokenFromRequest: req => {
      const token = req.headers['x-csrf-token'] ?? req.body?._csrf;
      return typeof token === 'string' && token.length <= 256 ? token : undefined;
    },
  });
  const originAllowed = (req: Request) => {
    const origin = req.headers.origin;
    const site = req.get('sec-fetch-site');
    return site !== 'cross-site' && site !== 'same-site' && (origin === undefined || origins.has(origin));
  };
  const denyOrigin: RequestHandler = (req, res) =>
    sendApiErrors(req, res, 403, [{ detail: 'Cross-origin request denied' }]);
  const protect: RequestHandler = (req, res, next) => {
    if (!originAllowed(req)) {
      denyOrigin(req, res, next);
      return;
    }
    implementation.csrfSynchronisedProtection(req, res, error => {
      if (error === implementation.invalidCsrfTokenError)
        sendApiErrors(req, res, 403, [{ detail: 'Invalid CSRF token' }]);
      else next(error);
    });
  };
  const apiProtect = httpAction(async (req, res, next) => {
    if (!originAllowed(req)) {
      denyOrigin(req, res, next);
      return;
    }
    const authorization = req.headers.authorization;
    const bearer = typeof authorization === 'string' ? /^Bearer ([^\s,]+)$/i.exec(authorization)?.[1] : undefined;
    if (bearer && input.authenticateBearer && (await input.authenticateBearer(bearer))) {
      next();
      return;
    }
    protect(req, res, next);
  });
  const token = httpAction(async (req, res) => {
    if (!originAllowed(req)) {
      denyOrigin(req, res, () => {});
      return;
    }
    const value = implementation.generateToken(req);
    await new Promise<void>((resolve, reject) => req.session.save(error => (error ? reject(error) : resolve())));
    res.set({ 'Cache-Control': 'no-store, private', Pragma: 'no-cache', Expires: '0' }).json({ _csrf: value });
  });
  return { protect, apiProtect, token, generateToken: implementation.generateToken };
}
export function mountCsrfTokenRoute(router: Router, csrf: Pick<ReturnType<typeof createHttpCsrf>, 'token'>): void {
  router.get(csrfTokenRoute.path, csrf.token);
}
