import { createHttpCsrf, mountCsrfTokenRoute } from '../../src/http/express/csrf';
import { createPilotPolicies, PathRules } from '../../src/http/express';
import { nothingLogger } from '@researchdatabox/sails-ng-common';
import type { Router, RequestHandler } from 'express';
import {
  AuthenticationAccounts,
  type AuthBrandConfig,
  type AuthenticationAccountsInput,
} from '../../src/authentication/Accounts';
import { RoleModel } from '../../src/model/storage/RoleModel';
import { BrandingModel } from '../../src/model/storage/BrandingModel';
import { ExpressHost, prepareHttpMiddleware, httpErrorHandler, httpAction } from '../../src/http/express';
import {
  installLocalAuthentication,
  installAafAuthentication,
  installOidcAuthentication,
} from '../../src/http/express/identityProviders';
import { mountAuthenticationRoutes } from '../../src/http/express/login';
import { prepareSessionIndexes } from '../../src/persistence/sessions/indexes';
import { mongoFixture } from './mongoFixture';

export const aafSecret = 'synthetic-aaf-signing-secret-for-tests-only';
export async function authenticationFixture(
  options: {
    rootContext?: string;
    port?: number;
    secure?: boolean;
    trustProxy?: boolean;
    config?: AuthBrandConfig;
    csrf?: RequestHandler;
    protectCsrf?: boolean;
    hook?: AuthenticationAccountsInput['resolveHook'];
    audit?: () => Promise<void>;
    prepare?(router: Router, csrf?: ReturnType<typeof createHttpCsrf>): void;
  } = {}
) {
  const f = await mongoFixture();
  const brand = Object.assign(new BrandingModel(), f.brand);
  const adminRole = Object.assign(new RoleModel(), f.role, { branding: brand });
  const readerRole = Object.assign(new RoleModel(), f.reader, { branding: brand });
  brand.roles = [adminRole, readerRole];
  const otherBrand = Object.assign(new BrandingModel(), f.otherBrand, { roles: [] });
  const config = options.config ?? {
    active: ['local', 'aaf'],
    aaf: { opts: { secretOrKey: aafSecret, algorithms: ['HS256'] } },
  };
  const accounts = new AuthenticationAccounts({
    repository: f.identities,
    log: nothingLogger,
    defaultBrand: () => brand,
    getBrand: name => (name === brand.name ? brand : otherBrand),
    authConfig: () => config,
    defaultAuthenticatedRole: () => readerRole,
    nestedRoles: name => [name === 'Admin' ? adminRole : readerRole],
    authorizedEmails: () => ({
      enabled: true,
      domainsOidc: ['example.com', 'exception.example.com'],
      domainsAaf: ['example.invalid'],
    }),
    resolveHook:
      options.hook ??
      (() => {
        throw new Error('Unregistered authentication hook');
      }),
    event: () => {},
  });
  const session = {
    name: 'redbox.v6.sid',
    secret: 'synthetic-secret-at-least-32-characters-long',
    adapter: 'mongo',
    mongoUrl: process.env.HTTP_PILOT_TEST_MONGO_URL!.replace('/sr_p4_http', '/' + f.native.db().databaseName),
    collection: 'authSessions',
    cookie: { secure: options.secure ?? false, httpOnly: true, sameSite: 'lax' as const },
  };
  let failures = 0;
  const root = options.rootContext ?? '/portal';
  const host = new ExpressHost(f.application, {
    owner: f.owner,
    hostname: '127.0.0.1',
    port: options.port ?? 0,
    rootContext: root,
    trustProxy: options.trustProxy,
    prepare: async router => {
      const auth = await prepareHttpMiddleware(router, {
        owner: f.owner,
        identity: f.identity,
        session,
        log: nothingLogger,
        configureAuthentication: async passport => {
          const providers = { passport, accounts, config, brand: () => brand };
          installLocalAuthentication(providers);
          installAafAuthentication(providers);
          await installOidcAuthentication(providers);
        },
      });
      router.get('/__test/session', (req, res) => {
        req.session.branding = 'default';
        req.session.portal = 'rdmp';
        res.json({ id: req.sessionID });
      });
      router.get(
        '/__test/actor',
        httpAction(async (req, res) => {
          res.json(await auth.authenticate(req));
        })
      );
      const csrf = options.protectCsrf
        ? createHttpCsrf({
            origins: [`http://127.0.0.1:${host.address()!.port}`],
            authenticateBearer: token => f.identity.bearer(token),
          })
        : undefined;
      if (csrf) {
        mountCsrfTokenRoute(router, csrf);
        const pathRules = new PathRules(() => f.identities.list('pathrule', {}, { populate: ['role', 'branding'] }));
        await f.identities.create('pathrule', {
          path: '/:branding/:portal/__test/schema',
          role: f.role.id,
          branding: f.brand.id,
          can_update: true,
        });
        await pathRules.loadRules();
        const policies = createPilotPolicies({
          branding: f.branding,
          pathRules,
          portals: ['rdmp'],
          defaultUnauthenticatedRole: () => undefined,
          emitRequestFailure: async () => {},
          authenticate: req => auth.authenticate(req),
        });
        const chain = [
          policies.brandingandportal,
          policies.iswebserviceauthenticated,
          policies.brandactor,
          policies.checkauth,
        ];
        router.post('/:branding/:portal/api/__test/protected', ...chain, csrf.apiProtect, (_req, res) =>
          res.json({ saved: true })
        );
        router.post(
          '/:branding/:portal/__test/protected',
          ...chain,
          csrf.protect,
          httpAction(async (_req, res) => {
            await f.native.db().collection('csrfProbeWrites').insertOne({ saved: true });
            res.json({ saved: true });
          })
        );
        router.post(
          '/:branding/:portal/__test/schema',
          ...chain.slice(0, -1),
          policies.checkrecordschemaauth,
          csrf.protect,
          (_req, res) => res.json({ saved: true })
        );
      }
      mountAuthenticationRoutes(router, {
        passport: auth.passport,
        identity: f.identity,
        rootContext: root,
        defaultBrand: 'default',
        defaultPortal: 'rdmp',
        validContext: (name, portal) => ['default', 'other'].includes(name) && portal === 'rdmp',
        brandId: name => (name === 'default' ? f.brand.id : f.otherBrand.id),
        postLoginPath: (name, portal) => `${root}/${name}/${portal}/home`,
        logoutOrigins: process.env.OIDC_TEST_ISSUER ? [new URL(process.env.OIDC_TEST_ISSUER).origin] : [],
        audit: async (action, actor) => {
          await options.audit?.();
          await f.identities.create('useraudit', {
            user: { id: actor.id, username: actor.username },
            action,
          });
        },
        loginFailure: async () => {
          failures++;
        },
        // Auth-only fixture; SR-039 replaces this with the qualified CSRF middleware.
        csrf: options.csrf ?? csrf?.protect ?? ((_req, _res, next) => next()),
      });
      options.prepare?.(router, csrf);
      router.use(httpErrorHandler(nothingLogger));
    },
  });
  try {
    await prepareSessionIndexes(f.owner, session, 'ensure');
    await host.initialize();
    await host.activate();
    return {
      ...f,
      accounts,
      host,
      url: `http://127.0.0.1:${host.address()!.port}${root}`,
      failures: () => failures,
      async close() {
        await host.stop();
        await f.close();
      },
    };
  } catch (error) {
    await host.stop();
    await f.close();
    throw error;
  }
}
export function responseCookie(response: Response): string {
  return response.headers.get('set-cookie')?.split(';')[0] ?? '';
}
export function localLogin(
  url: string,
  cookie = '',
  body: unknown = { username: 'pilot-admin', password: 'pilot-password' }
) {
  return fetch(url + '/user/login_local', {
    method: 'POST',
    redirect: 'manual',
    headers: { 'Content-Type': 'application/json', 'x-source': 'jsclient', Cookie: cookie },
    body: JSON.stringify(body),
  });
}
