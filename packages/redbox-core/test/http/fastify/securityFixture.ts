import { createHash } from 'node:crypto';
import { request } from 'node:http';
import express, { type Router, type Request, type Response as ExpressResponse, type NextFunction } from 'express';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { nothingLogger } from '@researchdatabox/sails-ng-common';
import { ApplicationRuntime } from '../../../src/application';
import { HttpIdentity } from '../../../src/http/express/identity';
import { ExpressHost } from '../../../src/http/express/ExpressHost';
import { prepareHttpMiddleware, httpAction, httpErrorHandler } from '../../../src/http/express/middleware';
import {
  createHttpPolicies,
  bindHttpPolicies,
  requestContext as expressContext,
} from '../../../src/http/express/policies';
import { createHttpCsrf } from '../../../src/http/express/csrf';
import type { FastifyPreparation } from '../../../src/http/fastify/preparation';
import { FastifyHost } from '../../../src/http/fastify/FastifyHost';
import { prepareNativeParsers } from '../../../src/http/fastify/parsers';
import { installSafeHttpErrors, type SafeHttpObservers } from '../../../src/http/fastify/responses';
import { prepareNativeAuthentication } from '../../../src/http/fastify/authentication';
import { createNativePolicies, bindNativeRouteSecurity } from '../../../src/http/fastify/policies';
import { createNativeCsrf } from '../../../src/http/fastify/csrf';
import { composeRoutes, expressRuntimePath, type RouteRegistration } from '../../../src/http/fastify/routes';
import { requestContext } from '../../../src/http';
import { prepareNativeSessions } from '../../../src/http/fastify/session';
import { prepareSessionIndexes } from '../../../src/persistence/sessions/indexes';
import { mongoFixture } from '../mongoFixture';
import { productionActors } from './securityProductionFixture';

export const canonical = 'https://portal.example.invalid';
export function rawRequest(
  url: string,
  method: string,
  type?: string,
  body: string | Buffer = '',
  extra: Record<string, string> = {},
  framed = true
) {
  return new Promise<{ status: number; statusMessage: string; text: string; headers: Record<string, any> }>(
    (resolve, reject) => {
      const req = request(
        url,
        {
          method,
          headers: {
            ...extra,
            ...(type === undefined ? {} : { 'Content-Type': type }),
            ...(framed ? { 'Content-Length': Buffer.byteLength(body) } : {}),
          },
        },
        res => {
          const chunks: Buffer[] = [];
          res.on('data', chunk => chunks.push(chunk));
          res.on('end', () =>
            resolve({
              status: res.statusCode!,
              statusMessage: res.statusMessage!,
              text: Buffer.concat(chunks).toString(),
              headers: res.headers,
            })
          );
        }
      );
      req.setTimeout(15000, () => req.destroy(new Error('Raw request timeout')));
      req.on('error', reject);
      if (framed) req.end(body);
      else req.end();
    }
  );
}
export const policyChain = ['nocache', 'brandingandportal', 'iswebserviceauthenticated', 'brandactor', 'checkauth'];
export function route(path = '/:branding/:portal/api/probe', method: 'get' | 'post' = 'post'): RouteRegistration {
  return {
    provider: 'fm016',
    declaration: {
      name: 'fm016.probe',
      path,
      method,
      controller: 'Probe',
      action: 'probe',
      access: { kind: 'policies', names: policyChain as [string, ...string[]] },
    },
  };
}
export interface SecurityOptions {
  /** Simulate a current identity change between explicit and configured policies. */
  brandLookup?(): void;
  pathRules?: import('../../../src/http/fastify/policies').NativePolicyInput['pathRules'];
  routes?: readonly RouteRegistration[];
  mongo?: boolean;
  productionRules?: boolean;
  openPaths?: boolean;
  observers?: SafeHttpObservers;
  /** Test-only native actions; the production family conversion is a later task. */
  action?(req: FastifyRequest, reply: FastifyReply): unknown;
  mount?(router: Router, input: Record<string, any>): void;
  rawPrefixes?: string[];
  defaults?: boolean;
  /** Inject invalid collaborator-produced values; wire headers remain strings. */
  beforeSecurity?(req: FastifyRequest, reply: FastifyReply): unknown;
}
export async function securityFixture(native: boolean, options: SecurityOptions = {}) {
  let prepare!: (app: FastifyPreparation) => Promise<void>;
  let host: FastifyHost | ExpressHost;
  const mongo = options.mongo
    ? await mongoFixture(
        native
          ? (app, owner) => {
              host = new FastifyHost(app, { owner, hostname: '127.0.0.1', port: 0, prepare: app => prepare(app) });
            }
          : undefined
      )
    : undefined;
  const owner = mongo?.owner ?? { config: {}, log: { warn() {} } };
  const application = mongo?.application ?? new ApplicationRuntime(owner, []);
  const brand = mongo?.brand ?? { id: 'brand-1', name: 'default', variables: { color: 'blue' } };
  const otherBrand = mongo?.otherBrand ?? { id: 'brand-2', name: 'other' };
  const user = {
    id: 'user-1',
    username: 'fixture',
    type: 'local',
    roles: [
      { id: 'admin', branding: brand.id, name: 'Admin' },
      { id: 'other-admin', branding: otherBrand.id, name: 'Admin' },
    ],
  };
  const foreign = { ...user, id: 'foreign', roles: [user.roles[1]] };
  const state = {
    trace: [] as string[],
    pathDenied: false,
    failBrand: false,
    failProvider: false,
    failEvent: false,
    actor: user,
  };
  const logs: unknown[] = [];
  const log = {
    ...nothingLogger,
    debug: (...args: unknown[]) => {
      logs.push(args);
    },
    info: (...args: unknown[]) => {
      logs.push(args);
    },
    warn: (...args: unknown[]) => {
      logs.push(args);
    },
    error: (...args: unknown[]) => {
      logs.push(args);
    },
  };
  const digest = (value: string) => createHash('sha256').update(value).digest('base64');
  const identity =
    mongo?.identity ??
    new HttpIdentity({
      one: async () => state.actor,
      verifyPassword: async () => false,
      findByApiTokenHash: async (hash: string) => {
        state.trace.push('authenticate');
        if (state.failProvider)
          throw Object.assign(new Error('provider-secret password=body-secret mongodb://credential@host'), {
            response: { client_secret: 'client-secret' },
          });
        return hash === digest('good') ? state.actor : hash === digest('foreign') ? foreign : null;
      },
    } as any);
  const realRules = options.productionRules ? await productionActors(mongo!, options.openPaths) : undefined;
  const input = {
    rootContext: '/portal',
    portals: ['rdmp'],
    branding: {
      getBrand: async ({ name }: { name: string }) => {
        options.brandLookup?.();
        state.trace.push('brand');
        if (state.failBrand) throw new Error('datastore-secret mongodb://credential@host');
        return name === 'default' ? brand : name === 'other' ? otherBrand : null;
      },
    },
    pathRules: options.pathRules ??
      realRules ?? {
        getRulesFromPath: () => {
          state.trace.push('path');
          return state.pathDenied ? [{ role: 'denied', branding: brand.id }] : null;
        },
        canRead: () => false,
      },
    defaultUnauthenticatedRole: () => undefined,
    emitRequestFailure: async () => {
      state.trace.push('event');
      if (state.failEvent) throw new Error('observer-secret');
    },
  };
  const session = {
    adapter: options.mongo ? 'mongo' : undefined,
    mongoUrl: options.mongo
      ? process.env.HTTP_PILOT_TEST_MONGO_URL!.replace('/sr_p4_http', '/' + mongo!.native.db().databaseName)
      : undefined,
    collection: 'fm016Sessions',
    name: 'fm016.sid',
    secret: 'fm016-session-secret-000000000000000001',
    cookie: { secure: false },
  };
  const routes = options.routes ?? [route()];
  const names = [
    'nocache',
    'brandingandportal',
    'browseractor',
    'browserauthenticated',
    'iswebserviceauthenticated',
    'brandactor',
    'checkauth',
    'checkrecordschemaauth',
  ];
  const plan = await composeRoutes(routes, { policyNames: names, rootContext: '/portal' });
  const contextBody = (req: any, native: boolean) => {
    let context;
    try {
      context = native ? requestContext(req) : expressContext(req);
    } catch {
      /* unbranded */
    }
    return {
      ok: true,
      context: context
        ? {
            brand: context.brand.name,
            portal: context.portal,
            actor: context.actor && {
              username: context.actor.username,
              roles: context.actor.roles.map(role => ({
                name: role.name,
                brand: role.brandId === brand.id ? 'default' : 'other',
              })),
            },
          }
        : null,
    };
  };
  prepare = async app => {
    installSafeHttpErrors(
      app,
      options.observers ?? {
        log: message => {
          logs.push(message);
        },
      }
    );
    prepareNativeParsers(app, { parserExclusions: options.rawPrefixes });
    if (options.mongo) await prepareNativeSessions(app, owner, session as any);
    const auth = await prepareNativeAuthentication(app, {
      identity,
      accounts: {} as any,
      config: { active: [] },
      brand: () => brand as any,
    });
    const policies = createNativePolicies({ ...input, authenticate: auth.authenticate });
    const csrf = createNativeCsrf({ origins: [canonical], authenticateBearer: token => identity.bearer(token) });
    if (options.mongo) {
      if (!routes.some(route => route.declaration.path === '/csrfToken')) app.get('/portal/csrfToken', csrf.token);
      app.get('/portal/__session', async req => {
        req.session.set('passport', { user: mongo!.user.id });
        req.session.set('authenticationVersion', 6);
        return { saved: true };
      });
    }
    const guards = bindNativeRouteSecurity(plan, policies, csrf);
    plan.install(
      app,
      {
        action: () =>
          options.action ??
          ((req, _reply) => {
            state.trace.push('action');
            return contextBody(req, true);
          }),
      },
      async (binding, req, reply) => {
        await options.beforeSecurity?.(req, reply);
        if (options.defaults)
          Object.assign(req.params as Record<string, unknown>, {
            branding: (req.params as any).branding ?? 'default',
            portal: (req.params as any).portal ?? 'rdmp',
          });
        await guards(binding, req, reply);
      }
    );
  };
  if (!host!)
    host = native
      ? new FastifyHost(application, { owner, hostname: '127.0.0.1', port: 0, prepare })
      : new ExpressHost(application, {
          owner,
          hostname: '127.0.0.1',
          port: 0,
          rootContext: '/portal',
          prepare: async router => {
            const auth = await prepareHttpMiddleware(router, {
              owner,
              identity,
              session: session as any,
              log,
              parserExclusions: options.rawPrefixes?.map(value => value.replace(/^\/portal/, '')),
            });
            const policies = createHttpPolicies({ ...input, authenticate: auth.authenticate } as any);
            const csrf = createHttpCsrf({ origins: [canonical], authenticateBearer: token => identity.bearer(token) });
            if (options.mongo) {
              router.get('/csrfToken', csrf.token);
              router.get('/__session', (req, res) => {
                Reflect.set(req.session, 'passport', { user: mongo!.user.id });
                Reflect.set(req.session, 'authenticationVersion', 6);
                res.json({ saved: true });
              });
            }
            if (options.mount)
              options.mount(router, { policies, csrf, policyConfiguration: { '*': policyChain }, log });
            else
              for (const r of plan.routes) {
                const mode =
                  r.effectiveCsrf ?? (r.declaration.csrf ? (r.declaration.api ? 'apiProtect' : 'protect') : 'none');
                const guard = mode.startsWith('apiProtect')
                  ? csrf.apiProtect
                  : mode === 'protect'
                    ? csrf.protect
                    : mode.startsWith('protect except')
                      ? (req: Request, res: ExpressResponse, next: NextFunction) =>
                          ['GET', 'HEAD', 'OPTIONS'].includes(req.method) ? next() : csrf.protect(req, res, next)
                      : undefined;
                const method = r.declaration.method === 'all' ? 'all' : r.declaration.method;
                router[method](
                  expressRuntimePath(r.declaration.path),
                  (req: Request, _res: ExpressResponse, next: NextFunction) => {
                    if (options.defaults)
                      Object.assign(req.params as Record<string, unknown>, {
                        branding: req.params.branding ?? 'default',
                        portal: req.params.portal ?? 'rdmp',
                      });
                    next();
                  },
                  ...bindHttpPolicies(r.effectivePolicies, policies),
                  ...(guard ? [guard] : []),
                  httpAction(async (req, res) => {
                    state.trace.push('action');
                    if (r.declaration.head?.kind === 'deny' && req.method === 'HEAD') {
                      res.setHeader('Allow', 'GET');
                      res.status(405).end();
                      return;
                    }
                    res.json(contextBody(req, false));
                  })
                );
              }
            router.use(httpErrorHandler(log));
          },
        });
  try {
    if (options.mongo) await prepareSessionIndexes(owner, session, 'ensure');
    await host.initialize();
    await host.activate();
    return {
      host,
      state,
      logs,
      brand,
      user,
      mongo,
      plan,
      url: `http://127.0.0.1:${host.address()!.port}/portal`,
      async close() {
        await host.stop();
        if (mongo) await mongo.close();
      },
    };
  } catch (error) {
    await host.stop();
    if (mongo) await mongo.close();
    throw error;
  }
}
export async function observation(response: Response) {
  const text = await response.text();
  return {
    status: response.status,
    text,
    headers: Object.fromEntries(
      ['www-authenticate', 'location', 'cache-control', 'vary', 'allow', 'content-type'].map(key => [
        key,
        response.headers.get(key)?.replace(/; ?charset=utf-8/i, '') ?? null,
      ])
    ),
  };
}
