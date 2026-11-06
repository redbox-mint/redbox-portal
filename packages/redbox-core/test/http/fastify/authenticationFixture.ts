import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { createServer } from 'node:net';
import { nothingLogger } from '@researchdatabox/sails-ng-common';
import { mongoFixture } from '../mongoFixture';
import {
  AuthenticationAccounts,
  type AuthBrandConfig,
  type AuthenticationAccountsInput,
} from '../../../src/authentication/Accounts';
import { BrandingModel } from '../../../src/model/storage/BrandingModel';
import { RoleModel } from '../../../src/model/storage/RoleModel';
import { ExpressHost } from '../../../src/http/express/ExpressHost';
import { prepareHttpMiddleware, httpAction, httpErrorHandler } from '../../../src/http/express/middleware';
import {
  installLocalAuthentication,
  installAafAuthentication,
  installOidcAuthentication,
} from '../../../src/http/express/identityProviders';
import { mountAuthenticationRoutes, authenticationFailureEvent } from '../../../src/http/express/login';
import { FastifyHost } from '../../../src/http/fastify/FastifyHost';
import { prepareNativeSessions } from '../../../src/http/fastify/session';
import {
  prepareNativeAuthentication,
  installNativeAuthenticationRoutes,
} from '../../../src/http/fastify/authentication';
import { prepareSessionIndexes } from '../../../src/persistence/sessions/indexes';
import type { FastifyPreparation } from '../../../src/http/fastify/preparation';
import qs from 'qs';

export const secret = 'fm015-synthetic-aaf-signature-secret';
export function aafAssertion(payload: object, key = secret, algorithm = 'HS256') {
  const data = [
    { alg: algorithm, typ: 'JWT' },
    { iss: 'https://rapid.aaf.edu.au', exp: Math.floor(Date.now() / 1000) + 600, ...payload },
  ]
    .map(value => Buffer.from(JSON.stringify(value)).toString('base64url'))
    .join('.');
  return data + '.' + createHmac('sha256', key).update(data).digest('base64url');
}
export async function availablePort() {
  const server = createServer();
  await new Promise<void>((resolve, reject) => server.once('error', reject).listen(0, '127.0.0.1', resolve));
  const address = server.address();
  assert(address && typeof address === 'object');
  await new Promise<void>((resolve, reject) => server.close(error => (error ? reject(error) : resolve())));
  return address.port;
}
export interface FixtureOptions {
  config?: AuthBrandConfig;
  port?: number;
  logoutOrigins?: string[];
  hook?: AuthenticationAccountsInput['resolveHook'];
  audit?: () => Promise<void>;
  bearer?: () => Promise<void>;
  renderFailure?: boolean;
}

/** The two real hosts use the same account domain, repositories, configuration and effects.
 * Express goes through its unchanged production middleware/providers/login adapter.
 */
export async function authenticationFixture(native: boolean, options: FixtureOptions = {}) {
  let nativeHost: FastifyHost | undefined;
  let prepareNative!: (app: FastifyPreparation) => Promise<void>;
  const f = await mongoFixture(
    native
      ? (application, owner) => {
          nativeHost = new FastifyHost(application, {
            owner,
            hostname: '127.0.0.1',
            port: options.port ?? 0,
            prepare: app => prepareNative(app),
          });
        }
      : undefined
  );
  const version = String((await f.native.db().admin().command({ buildInfo: 1 })).version)
    .split('.')
    .map(Number);
  assert(version[0] > 9 || (version[0] === 9 && (version[1] > 0 || version[2] >= 4)));
  const brand = Object.assign(new BrandingModel(), f.brand);
  const admin = Object.assign(new RoleModel(), f.role, { branding: brand });
  const reader = Object.assign(new RoleModel(), f.reader, { branding: brand });
  brand.roles = [admin, reader];
  const config = options.config ?? {
    active: ['local', 'aaf'],
    aaf: { opts: { secretOrKey: secret, algorithms: ['HS256'] } },
  };
  const events: Record<string, unknown>[] = [];
  const accounts = new AuthenticationAccounts({
    repository: f.identities,
    log: nothingLogger,
    defaultBrand: () => brand,
    getBrand: () => brand,
    authConfig: () => config,
    defaultAuthenticatedRole: () => reader,
    nestedRoles: () => [reader],
    authorizedEmails: () => ({ enabled: true, domainsAaf: ['example.invalid'], domainsOidc: ['example.invalid'] }),
    resolveHook:
      options.hook ??
      (() => {
        throw new Error('Unregistered fixture hook');
      }),
    event: info => events.push(info),
  });
  if (options.bearer) {
    const bearer = f.identity.bearer.bind(f.identity);
    f.identity.bearer = async token => {
      await options.bearer!();
      return bearer(token);
    };
  }
  const session = {
    adapter: 'mongo' as const,
    mongoUrl: process.env.HTTP_PILOT_TEST_MONGO_URL!.replace('/sr_p4_http', '/' + f.native.db().databaseName),
    name: 'redbox.v6.sid',
    secret: 'fm015-native-session-signing-secret-000000001',
    collection: 'authSessions',
    cookie: { secure: false, httpOnly: true, sameSite: 'lax' as const },
  };
  const routeInput = {
    identity: f.identity,
    rootContext: '/portal',
    defaultBrand: 'default',
    defaultPortal: 'rdmp',
    validContext: (name: string, portal: string) => ['default', 'other'].includes(name) && portal === 'rdmp',
    brandId: (name: string) => (name === 'default' ? f.brand.id : f.otherBrand.id),
    postLoginPath: (name: string, portal: string) => `/portal/${name}/${portal}/home`,
    logoutOrigins: options.logoutOrigins ?? [],
    audit: async (action: 'login' | 'logout', actor: { id: string; username: string }) => {
      await options.audit?.();
      await f.identities.create('useraudit', { user: { id: actor.id, username: actor.username }, action });
    },
    credentialFields: [config.local?.usernameField ?? 'username', config.local?.passwordField ?? 'password'] as const,
  };
  prepareNative = async app => {
    // Parsed-input seam only; the complete bounded parser pipeline is FM-016.
    app.addContentTypeParser(
      'application/x-www-form-urlencoded',
      { parseAs: 'string', bodyLimit: 1024 * 1024 },
      (_request, body, done) => done(null, qs.parse(String(body)))
    );
    await prepareNativeSessions(app, f.owner, session);
    const authentication = await prepareNativeAuthentication(app, {
      identity: f.identity,
      accounts,
      config,
      brand: () => brand,
    });
    app.get('/portal/__test/session', async req => {
      req.session.set('branding', 'default');
      req.session.set('portal', 'rdmp');
      return { id: req.session.sessionId };
    });
    app.get('/portal/__test/actor', async req => authentication.authenticate(req));
    app.post('/portal/__test/actor', async req => authentication.authenticate(req));
    installNativeAuthenticationRoutes(app, authentication, {
      ...routeInput,
      loginFailure: async req => {
        events.push({
          ...authenticationFailureEvent(
            { method: req.method, path: req.url.split('?')[0].replace(/^\/portal/, ''), body: req.body },
            { brandId: f.brand.id, portalId: 'rdmp' },
            routeInput.credentialFields[0]
          ),
        });
      },
      // CSRF is an explicit guard input. FM-016 owns its native implementation.
      csrf: async () => {},
      renderAuthenticationFailure: options.renderFailure
        ? async (_req, reply, reason) => {
            reply
              .code(403)
              .type('text/html')
              .send('<p>' + reason + '</p>');
          }
        : undefined,
    });
    app.setErrorHandler((_err, _req, reply) =>
      reply
        .code(500)
        .headers({ 'Cache-Control': 'no-cache, private', Pragma: 'no-cache', Expires: '0' })
        .send({ message: 'Internal server error', details: '' })
    );
  };
  const host = native
    ? nativeHost!
    : new ExpressHost(f.application, {
        owner: f.owner,
        hostname: '127.0.0.1',
        port: options.port ?? 0,
        rootContext: '/portal',
        prepare: async router => {
          const authentication = await prepareHttpMiddleware(router, {
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
          for (const method of ['get', 'post'] as const)
            router[method](
              '/__test/actor',
              httpAction(async (req, res) => {
                res.json(await authentication.authenticate(req));
              })
            );
          mountAuthenticationRoutes(router, {
            ...routeInput,
            passport: authentication.passport,
            loginFailure: async req => {
              events.push({
                ...authenticationFailureEvent(
                  req,
                  { brandId: f.brand.id, portalId: 'rdmp' },
                  routeInput.credentialFields[0]
                ),
              });
            },
            csrf: (_req, _res, next) => next(),
            renderAuthenticationFailure: options.renderFailure
              ? async (_req, res, reason) => {
                  res
                    .status(403)
                    .type('text/html')
                    .send('<p>' + reason + '</p>');
                }
              : undefined,
          });
          router.use(httpErrorHandler(nothingLogger));
        },
      });
  try {
    await prepareSessionIndexes(f.owner, session, 'ensure');
    await host.initialize();
    await host.activate();
    return {
      ...f,
      host,
      events,
      url: `http://127.0.0.1:${host.address()!.port}/portal`,
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
