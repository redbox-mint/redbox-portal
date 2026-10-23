import type { createHttpAuthentication } from './authentication';
import type { Request, RequestHandler, Router } from 'express';
import type { HttpIdentity, AuthenticatedActor } from './identity';
import { AuthenticationRejected } from '../../authentication/Accounts';
import { apiNoCacheHeaders } from './responses';
import { httpAction } from './middleware';

export const authenticationRoutes = [
  ['post', '/user/login_local', 'localLogin'],
  ['post', '/user/login_aaf', 'aafLogin'],
  ['get', '/user/login_oidc', 'openidConnectLogin'],
  ['get', '/user/begin_oidc', 'beginOidc'],
  ['head', '/user/begin_oidc', 'disallowedHeadRequestHandler'],
  ['get', '/user/info', 'info'],
  ['get', '/:branding/:portal/user/info', 'info'],
  ['post', '/:branding/:portal/user/logout', 'logout'],
  ['get', '/:branding/:portal/user/logout', 'logout'],
].map(([method, path, action]) => ({ method, path, action, controller: 'UserController' }));

export interface AuthenticationHttpInput {
  readonly passport: Pick<ReturnType<typeof createHttpAuthentication>['passport'], 'authenticate'>;
  readonly identity: HttpIdentity;
  readonly rootContext?: string;
  readonly defaultBrand: string;
  readonly defaultPortal: string;
  /** Only configured local brand/portal pairs may be persisted in the session. */
  validContext(brand: string, portal: string): boolean;
  brandId(name: string): string;
  postLoginPath(brand: string, portal: string): string;
  readonly postLogoutPath?: string;
  /** Include the configured IdP logout origins; return URLs never come from the request. */
  readonly logoutOrigins?: readonly string[];
  audit(action: 'login' | 'logout', actor: AuthenticatedActor, req: Request): Promise<void>;
  loginFailure(req: Request): Promise<void>;
  readonly csrf: RequestHandler;
  readonly credentialFields?: readonly [string, string];
  readonly sessionCookie?: { readonly name: string; readonly path?: string; readonly domain?: string };
}
function sessionOperation(operation: (done: (error?: unknown) => void) => void): Promise<void> {
  return new Promise((resolve, reject) => operation(error => (error ? reject(error) : resolve())));
}
function safeLocalRedirect(value: unknown, root: string, fallback: string): string {
  return typeof value === 'string' && value.startsWith(root + '/') && !value.startsWith('//') && !/[\r\n\\]/.test(value)
    ? value
    : fallback;
}

export function mountAuthenticationRoutes(router: Router, input: AuthenticationHttpInput): void {
  const root = input.rootContext ?? '';
  const context = (req: Request) => {
    const brand =
      req.params.branding ?? req.body?.branding ?? req.query.branding ?? req.session.branding ?? input.defaultBrand;
    const portal =
      req.params.portal ?? req.body?.portal ?? req.query.portal ?? req.session.portal ?? input.defaultPortal;
    if (typeof brand !== 'string' || typeof portal !== 'string' || !input.validContext(brand, portal)) return null;
    return { brand, portal };
  };
  const strategy = (req: Request) => {
    const id = req.query.id;
    if (id === undefined || id === '') return 'oidc';
    if (typeof id !== 'string' || !/^[A-Za-z0-9_-]+$/.test(id)) throw new URIError('Invalid OIDC identifier');
    return 'oidc-' + id;
  };
  const login = (name: (req: Request) => string, local = false, oidc = false): RequestHandler =>
    httpAction(async (req, res) => {
      const selected = oidc
        ? typeof req.session.branding === 'string' &&
          typeof req.session.portal === 'string' &&
          input.validContext(req.session.branding, req.session.portal)
          ? { brand: req.session.branding, portal: req.session.portal }
          : null
        : context(req);
      if (!selected) {
        res.status(400).json({ message: 'Invalid branding or portal' });
        return;
      }
      if (
        local &&
        (input.credentialFields ?? ['username', 'password']).some(
          field => typeof req.body?.[field] !== 'string' || !req.body[field] || req.body[field].length > 4096
        )
      ) {
        res.status(400).json({ message: 'Invalid login parameters' });
        return;
      }
      const authenticating = new Promise<unknown>((resolve, reject) => {
        input.passport.authenticate(name(req), (error: unknown, user: unknown) =>
          error ? reject(error) : resolve(user)
        )(req, res, reject);
      });
      let actor: AuthenticatedActor | false = false;
      try {
        const user = await authenticating;
        if (user && typeof user === 'object' && typeof Reflect.get(user, 'id') === 'string')
          actor = await input.identity.session(Reflect.get(user, 'id'));
      } catch (error) {
        if (
          !(error instanceof AuthenticationRejected) &&
          !(error instanceof Error && error.message === 'Account is disabled') &&
          !(error && typeof error === 'object' && String(Reflect.get(error, 'code')).startsWith('OAUTH_'))
        ) {
          await input.loginFailure(req);
          throw error;
        }
      }
      if (actor && !actor.roles.some(role => role.brandId === input.brandId(selected.brand))) actor = false;
      if (!actor) {
        await input.loginFailure(req);
        if (local) res.set(apiNoCacheHeaders).json({ message: 'Incorrect username/password', user: false });
        else res.set(apiNoCacheHeaders).status(403).json({ message: 'Authentication rejected', user: false });
        return;
      }
      const actorSnapshot = actor;
      const profile = await input.identity.profile(actorSnapshot.id);
      if (!profile) {
        res.status(403).end();
        return;
      }
      const logoutUrl: unknown = Reflect.get(req.session, 'logoutUrl');
      const fallback = input.postLoginPath(selected.brand, selected.portal);
      const redirect = safeLocalRedirect(Reflect.get(req.session, 'redirUrl') ?? req.query.redirUrl, root, fallback);
      try {
        await sessionOperation(done => req.logIn(actorSnapshot, done));
        Reflect.set(req.session, 'authenticationVersion', 6);
        req.session.branding = selected.brand;
        req.session.portal = selected.portal;
        if (typeof logoutUrl === 'string') {
          const url = URL.parse(logoutUrl);
          if (url && input.logoutOrigins?.includes(url.origin)) Reflect.set(req.session, 'logoutUrl', url.toString());
        }
        await input.audit('login', actorSnapshot, req);
        await sessionOperation(done => req.session.save(done));
      } catch (error) {
        await sessionOperation(done => req.session.destroy(done));
        res.clearCookie(input.sessionCookie?.name ?? 'redbox.v6.sid', {
          path: input.sessionCookie?.path ?? '/',
          domain: input.sessionCookie?.domain,
        });
        throw error;
      }
      if (local && req.get('x-source') === 'jsclient')
        res.set(apiNoCacheHeaders).json({ user: profile, message: 'Login OK', url: redirect });
      else res.redirect(redirect);
    });
  router.post(
    '/user/login_local',
    input.csrf,
    login(() => 'local', true)
  );
  // Provider callbacks carry verified state/assertions, never header-derived exemptions.
  router.post(
    '/user/login_aaf',
    (req, res, next) => {
      if (typeof req.body?.assertion !== 'string' || !req.body.assertion || req.body.assertion.length > 65536) {
        res.status(400).json({ message: 'Invalid assertion' });
        return;
      }
      next();
    },
    login(() => 'aaf-jwt')
  );
  router.get('/user/login_oidc', login(strategy, false, true));
  router.head('/user/begin_oidc', (_req, res) => {
    res.sendStatus(405);
  });
  router.get(
    '/user/begin_oidc',
    httpAction(async (req, res, next) => {
      const selected = context(req);
      if (!selected) {
        res.status(400).json({ message: 'Invalid branding or portal' });
        return;
      }
      req.session.branding = selected.brand;
      req.session.portal = selected.portal;
      if (typeof req.query.redirUrl === 'string')
        Reflect.set(
          req.session,
          'redirUrl',
          safeLocalRedirect(req.query.redirUrl, root, input.postLoginPath(selected.brand, selected.portal))
        );
      // The library owns PKCE/state, binds it to the session and saves before redirect.
      input.passport.authenticate(strategy(req))(req, res, next);
    })
  );
  const info = httpAction(async (req, res) => {
    const actor = await input.identity.session(
      req.user && typeof Reflect.get(req.user, 'id') === 'string' ? Reflect.get(req.user, 'id') : ''
    );
    if (!actor) {
      res.status(403).json({ message: 'error-please-login' });
      return;
    }
    if (req.params.branding) {
      const selected = context(req);
      if (!selected || !actor.roles.some(role => role.brandId === input.brandId(selected.brand))) {
        res.status(403).end();
        return;
      }
    }
    res.set(apiNoCacheHeaders).json({ user: await input.identity.profile(actor.id) });
  });
  router.get('/user/info', info);
  router.get('/:branding/:portal/user/info', info);
  router.get('/:branding/:portal/user/logout', (_req, res) => {
    res.set('Allow', 'POST').sendStatus(405);
  });
  router.post(
    '/:branding/:portal/user/logout',
    input.csrf,
    httpAction(async (req, res) => {
      const selected = context(req);
      if (!selected) {
        res.status(400).end();
        return;
      }
      const actor = await input.identity.session(
        req.user && typeof Reflect.get(req.user, 'id') === 'string' ? Reflect.get(req.user, 'id') : ''
      );
      if (!actor || !actor.roles.some(role => role.brandId === input.brandId(selected.brand))) {
        res.status(403).end();
        return;
      }
      let redirect = input.postLogoutPath ?? root + '/' + selected.brand + '/' + selected.portal + '/home';
      const candidate: unknown = Reflect.get(req.session, 'logoutUrl');
      if (typeof candidate === 'string') {
        const url = URL.parse(candidate);
        if (url && input.logoutOrigins?.includes(url.origin)) redirect = url.toString();
      }
      await input.audit('logout', actor, req);
      await sessionOperation(done => req.logout(done));
      await sessionOperation(done => req.session.destroy(done));
      res.clearCookie(input.sessionCookie?.name ?? 'redbox.v6.sid', {
        path: input.sessionCookie?.path ?? '/',
        domain: input.sessionCookie?.domain,
      });
      res.set(apiNoCacheHeaders).redirect(redirect);
    })
  );
}
